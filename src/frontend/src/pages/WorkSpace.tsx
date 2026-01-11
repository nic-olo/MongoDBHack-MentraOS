import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QueryPrompt from "../ui/query-prompt";
import SideNav from "../ui/left-side-nav";
import { isMobileDevice } from "../util/deviceDetection";
import { queryMasterAgent, queryAgentStatus } from "../api/masterAgent";
import AgentMessage from "../components/AgentMessage";
import { createConversation, addMessage, getConversation } from "../api/conversations";

interface Transcription {
  text: string;
  speakerId: string;
  isFinal: boolean;
  utteranceId?: string;
  startTime: number;
  endTime: number;
}

function Test() {
  const isMobile = isMobileDevice();

  // TODO: Get actual userId from auth context (use useMentraAuth hook)
  const userId = 'user_123';

  // Chat state management
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant',
    content: string,
    isProcessing?: boolean,
    progressMessage?: string
  }>>([]);
  const [transcriptions] = useState<Transcription[]>([]);
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationRefreshTrigger, setConversationRefreshTrigger] = useState(0);

  const hasMessages = messages.length > 0;
  const isAgentRunning = messages.length > 0 && messages[messages.length - 1]?.isProcessing;

  // Helper to refresh conversation sidebar
  const refreshConversations = () => {
    setConversationRefreshTrigger(Date.now());
  };

  /**
   * Load a conversation from history
   */
  const loadConversation = async (conversationId: string) => {
    try {
      const conversation = await getConversation(conversationId);
      setCurrentConversationId(conversation.id);
      setMessages(conversation.messages?.map(msg => ({
        role: msg.role,
        content: msg.content,
        isProcessing: false
      })) || []);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  /**
   * Start a new conversation
   */
  const startNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  const handleSendMessage = async (message: string) => {
    console.log('Sent:', message);

    // Add user message to the list
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    // Add processing message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Initializing...',
      isProcessing: true,
      progressMessage: 'Preparing your request...'
    }]);

    try {
      // Check if the message contains the keyword "status"
      const lowerMessage = message.toLowerCase();
      const isStatusQuery = lowerMessage.includes('status');
      
      let result;
      
      if (isStatusQuery) {
        // Extract the query part after "status"
        const statusIndex = lowerMessage.indexOf('status');
        const queryAfterStatus = message.substring(statusIndex + 6).trim(); // "status" is 6 chars
        
        // If there's a query after "status", use it; otherwise use the full message
        const statusQuery = queryAfterStatus || message;
        
        console.log('🔍 Status query detected:', statusQuery);
        
        result = await queryAgentStatus(
          userId,
          statusQuery,
          (progressMessage) => {
            console.log('Status Progress:', progressMessage);

            // Update the processing message with progress
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];

              if (lastMessage && lastMessage.isProcessing) {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  progressMessage
                };
              }

              return newMessages;
            });
          }
        );
      } else {
        // Regular master agent query
        result = await queryMasterAgent(
          userId,
          message,
          (progressMessage) => {
            console.log('Progress:', progressMessage);

            // Update the processing message with progress
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];

              if (lastMessage && lastMessage.isProcessing) {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  progressMessage
                };
              }

              return newMessages;
            });
          }
        );
      }

      // Remove processing message and add actual response
      let assistantContent = '';
      if (result.status === 'completed' && result.result) {
        assistantContent = result.result.synthesis;
      } else if (result.status === 'failed') {
        assistantContent = `Error: ${result.error || 'Task failed'}`;
      } else {
        assistantContent = 'Task did not complete successfully';
      }

      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);
        return [...withoutProcessing, {
          role: 'assistant',
          content: assistantContent,
          isProcessing: false
        }];
      });

      console.log('Master Agent full response:', result);

      // Save conversation to database
      try {
        if (!currentConversationId) {
          // Create new conversation with first message
          const conversation = await createConversation(
            userId,
            {
              role: 'user',
              content: message,
              isStatusQuery
            }
          );
          setCurrentConversationId(conversation.id);
          console.log('Created new conversation:', conversation.id);

          // Add assistant response
          await addMessage(conversation.id, {
            role: 'assistant',
            content: assistantContent,
            isStatusQuery
          });
          
          // Refresh conversation list to show new conversation
          refreshConversations();
        } else {
          // Add both messages to existing conversation
          await addMessage(currentConversationId, {
            role: 'user',
            content: message,
            isStatusQuery
          });
          await addMessage(currentConversationId, {
            role: 'assistant',
            content: assistantContent,
            isStatusQuery
          });
          
          // Refresh conversation list to update timestamps
          refreshConversations();
        }
      } catch (dbError) {
        console.error('Failed to save conversation:', dbError);
        // Continue anyway - don't block user experience
      }
    } catch (error) {
      console.error('Master Agent Error:', error);

      // Remove processing message and add error
      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);
        return [...withoutProcessing, {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isProcessing: false
        }];
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--surface-base)' }}>
      {/* Animated Sidebar */}
      <AnimatePresence>
        {isSideNavOpen && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <SideNav
              isMobile={isMobile}
              currentConversationId={currentConversationId}
              userId={userId}
              onNewChat={startNewConversation}
              onLoadConversation={loadConversation}
              refreshTrigger={conversationRefreshTrigger}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen relative">
        {/* Header Bar - Mobile/Desktop */}
        {(isMobile || hasMessages) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between px-6 py-4"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface-base)'
            }}
          >
            <div className="flex items-center gap-3">
              {/* Toggle Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setIsSideNavOpen(!isSideNavOpen)}
                className={`${isMobile ? 'w-9 h-9' : 'w-10 h-10'} rounded-lg flex items-center justify-center transition-smooth focus-ring`}
                style={{ 
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--color-gray-700)'
                }}
                aria-label="Toggle sidebar"
              >
                <svg
                  className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  {isSideNavOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </motion.button>

              {/* Title */}
              <h1 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold`} style={{ color: 'var(--color-gray-900)', letterSpacing: 'var(--tracking-tight)' }}>
                MentraOS Agent
              </h1>
            </div>
          </motion.div>
        )}

        {/* Desktop Toggle Button - Only when no messages */}
        {!isMobile && !hasMessages && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => setIsSideNavOpen(!isSideNavOpen)}
            className="absolute top-6 left-6 z-50 w-10 h-10 rounded-lg flex items-center justify-center transition-smooth focus-ring"
            style={{ 
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
              color: 'var(--color-gray-700)'
            }}
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              {isSideNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </motion.button>
        )}

        {/* Desktop: Center prompt when no messages, Mobile: Always at bottom */}
        {!isMobile && !hasMessages ? (
          /* Desktop centered layout - no messages yet */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="flex-1 flex flex-col items-center justify-center p-6"
            style={{ backgroundColor: 'var(--surface-base)' }}
          >
            <div className="w-full max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-center mb-12"
              >
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 gradient-primary"
                  style={{ boxShadow: 'var(--shadow-glow)' }}
                >
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </motion.div>
                <h1 className="text-4xl font-semibold mb-3 gradient-text" style={{ letterSpacing: 'var(--tracking-tight)' }}>
                  Welcome to MentraOS
                </h1>
                <p className="text-base" style={{ color: 'var(--color-gray-500)' }}>
                  Ask me anything about your codebase or start a conversation
                </p>
              </motion.div>

              {/* Centered Query Prompt */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
              >
                <QueryPrompt
                  isMobile={isMobile}
                  onSendMessage={handleSendMessage}
                  placeholder="$ Enter command..."
                />
              </motion.div>
            </div>
          </motion.div>
        ) : (
          /* Desktop with messages OR Mobile (always this layout) */
          <>
            {/* Async Session Running Indicator */}
            <AnimatePresence>
              {isAgentRunning && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="px-6 py-4"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-accent-600) 100%)',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-2 h-2 bg-white rounded-full"
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 w-2 h-2 bg-white rounded-full"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Agent Processing</p>
                        <p className="text-xs text-white/80">
                          {messages[messages.length - 1]?.progressMessage || 'Processing your request...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Messages Area */}
            <div 
              className={`flex-1 overflow-y-auto p-6 ${messages.length === 0 ? 'flex items-center justify-center' : ''}`}
              style={{ backgroundColor: 'var(--surface-base)' }}
            >
              <div className="max-w-3xl mx-auto w-full">
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="text-center"
                  >
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                      className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 gradient-primary"
                      style={{ boxShadow: 'var(--shadow-glow)' }}
                    >
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </motion.div>
                    <h1 className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-semibold mb-3 gradient-text`} style={{ letterSpacing: 'var(--tracking-tight)' }}>
                      MentraOS Agent
                    </h1>
                    <p className={`${isMobile ? 'text-sm' : 'text-base'} mb-2`} style={{ color: 'var(--color-gray-600)' }}>
                      Smart Orchestrated Glasses Agents
                    </p>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} mt-6`} style={{ color: 'var(--color-gray-500)' }}>
                      Start a conversation by typing a message below
                    </p>
                  </motion.div>
                )}

                {/* Messages Display */}
                {messages.length > 0 && (
                  <div className="space-y-6">
                    <AnimatePresence mode="popLayout">
                      {messages.map((msg, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 20, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.4, 0, 0.2, 1],
                            delay: idx * 0.05
                          }}
                        >
                          {msg.role === 'user' ? (
                            <div className="flex justify-end">
                              <motion.div 
                                whileHover={{ scale: 1.01 }}
                                className="max-w-[80%] px-4 py-3 rounded-2xl gradient-primary text-white"
                                style={{ boxShadow: 'var(--shadow-md)' }}
                              >
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              </motion.div>
                            </div>
                          ) : (
                            <AgentMessage
                              content={msg.content}
                              isProcessing={msg.isProcessing}
                              progressMessage={msg.progressMessage}
                            />
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Transcriptions Display (if needed) */}
                {transcriptions.length > 0 && (
                  <div className="space-y-4 mt-8">
                    {transcriptions.map((trans, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
                      >
                        <p className="text-sm text-gray-700">{trans.text}</p>
                        <span className="text-xs text-gray-400">
                          Speaker: {trans.speakerId}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Query Prompt at Bottom */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
              style={{ 
                borderTop: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--surface-base)'
              }}
            >
              <QueryPrompt
                isMobile={isMobile}
                onSendMessage={handleSendMessage}
                placeholder="Ask me anything..."
              />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default Test;