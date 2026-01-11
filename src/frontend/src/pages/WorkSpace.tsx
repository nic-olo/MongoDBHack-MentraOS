import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QueryPrompt from "../ui/query-prompt";
import SideNav from "../ui/left-side-nav";
import { isMobileDevice } from "../util/deviceDetection";
import { queryMasterAgent, queryAgentStatus, getDisplayContent } from "../api/masterAgent";
import AgentMessage from "../components/AgentMessage";
import { createConversation, addMessage, getConversation } from "../api/conversations";

interface WorkSpaceProps {
  userId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  resultType?: 'direct_response' | 'clarifying_question' | 'agent_result';
  isProcessing?: boolean;
  progressMessage?: string;
  agentSpawned?: boolean;
  processingTimeMs?: number;
}

interface Transcription {
  text: string;
  speakerId: string;
  isFinal: boolean;
  utteranceId?: string;
  startTime: number;
  endTime: number;
}

function WorkSpace({ userId }: WorkSpaceProps) {
  const isMobile = isMobileDevice();

  // Chat state management
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
      content: 'Processing your query...',
      isProcessing: true,
      progressMessage: 'Preparing your request...'
    }]);

    setIsLoading(true);

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
                  content: progressMessage,
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
                  content: progressMessage,
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
      let resultType: 'direct_response' | 'clarifying_question' | 'agent_result' = 'direct_response';

      if (result.status === 'completed' && result.result) {
        // Use getDisplayContent for webview display
        assistantContent = getDisplayContent(result.result, false);
        resultType = result.result.type || 'direct_response';
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
          resultType,
          agentSpawned: result.agentSpawned,
          processingTimeMs: result.processingTimeMs,
          isProcessing: false
        }];
      });

      console.log('Master Agent full response:', result);

      // Log result type for debugging
      if (result.result) {
        console.log('Result type:', result.result.type);
        console.log('Glasses display:', result.result.glassesDisplay);
        console.log('Agent spawned:', result.agentSpawned);
      }

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
    } finally {
      setIsLoading(false);
    }
  };

  // Render assistant message based on type
  const renderAssistantMessage = (msg: Message, idx: number) => {
    // Show processing state with AgentMessage component
    if (msg.isProcessing) {
      return (
        <AgentMessage
          key={idx}
          content={msg.content}
          isProcessing={msg.isProcessing}
          progressMessage={msg.progressMessage}
        />
      );
    }

    // Clarifying question - show with question styling
    if (msg.resultType === 'clarifying_question') {
      return (
        <div key={idx} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Need more information</h3>
                <div className="text-amber-800 prose prose-sm prose-amber">
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Agent result - show with success styling and metadata
    if (msg.resultType === 'agent_result') {
      return (
        <div key={idx} className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-900">Task Completed</h3>
                {msg.processingTimeMs && (
                  <p className="text-sm text-green-700">
                    Completed in {(msg.processingTimeMs / 1000).toFixed(1)}s
                    {msg.agentSpawned && ' • Agent used'}
                  </p>
                )}
              </div>
            </div>
            <div className="prose prose-sm prose-green max-w-none">
              <div className="whitespace-pre-wrap text-green-900">{msg.content}</div>
            </div>
          </div>
        </div>
      );
    }

    // Direct response - use AgentMessage component for consistent styling
    return (
      <AgentMessage
        key={idx}
        content={msg.content}
        isProcessing={false}
        progressMessage={msg.progressMessage}
      />
    );
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
          >
            <div className="w-full max-w-2xl">
              {/* Welcome Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-center mb-10"
              >
                {/* Logo/Icon */}
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.4, type: "spring" }}
                  className="w-20 h-20 mx-auto mb-6 rounded-2xl gradient-primary flex items-center justify-center"
                  style={{ boxShadow: 'var(--shadow-glow)' }}
                >
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
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
                  disabled={isLoading}
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
                  className="px-6 py-3"
                  style={{
                    background: 'linear-gradient(to right, var(--color-primary-50), var(--color-secondary-50))',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--color-primary-600)' }}>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </motion.div>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-primary-700)' }}>
                      Agent session in progress...
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4" style={{ backgroundColor: 'var(--surface-base)' }}>
              <div className="max-w-4xl mx-auto">
                {/* Empty State */}
                {!hasMessages && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="flex flex-col items-center justify-center h-full text-center py-12"
                  >
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, duration: 0.4, type: "spring" }}
                      className="w-16 h-16 mb-6 rounded-2xl gradient-primary flex items-center justify-center"
                      style={{ boxShadow: 'var(--shadow-glow)' }}
                    >
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                      </svg>
                    </motion.div>
                    <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--color-gray-900)', letterSpacing: 'var(--tracking-tight)' }}>
                      Start a Conversation
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>
                      Type a message below to begin
                    </p>
                  </motion.div>
                )}

                {/* Messages */}
                {hasMessages && (
                  <div className="space-y-6">
                    <AnimatePresence mode="popLayout">
                      {messages.map((msg, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
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
                            renderAssistantMessage(msg, idx)
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
                disabled={isLoading}
              />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default WorkSpace;
