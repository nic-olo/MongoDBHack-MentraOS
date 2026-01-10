import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QueryPrompt from "../ui/query-prompt";
import SideNav from "../ui/left-side-nav";
import { isMobileDevice } from "../util/deviceDetection";
import { queryMasterAgent } from "../api/masterAgent";
import AgentMessage from "../components/AgentMessage";

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

  // Chat state management
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant',
    content: string,
    isProcessing?: boolean,
    progressMessage?: string
  }>>([]);
  const [transcriptions] = useState<Transcription[]>([]);
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);

  const hasMessages = messages.length > 0;
  const isAgentRunning = messages.length > 0 && messages[messages.length - 1]?.isProcessing;

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
      // TODO: Get actual userId from auth context (use useMentraAuth hook)
      const result = await queryMasterAgent(
        'user_123',
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

      // Remove processing message and add actual response
      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);

        if (result.status === 'completed' && result.result) {
          return [...withoutProcessing, {
            role: 'assistant',
            content: result.result.synthesis,
            isProcessing: false
          }];
        } else if (result.status === 'failed') {
          return [...withoutProcessing, {
            role: 'assistant',
            content: `Error: ${result.error || 'Task failed'}`,
            isProcessing: false
          }];
        } else {
          return [...withoutProcessing, {
            role: 'assistant',
            content: 'Task did not complete successfully',
            isProcessing: false
          }];
        }
      });

      console.log('Master Agent full response:', result);
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
    <div className="flex h-screen overflow-hidden bg-white font-mono">
      {/* Animated Sidebar */}
      <AnimatePresence>
        {isSideNavOpen && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <SideNav
              isMobile={isMobile}
              conversations={[
                {
                  id: '1',
                  title: 'Example Conversation',
                  timestamp: new Date(),
                  preview: 'This is a sample conversation...'
                }
              ]}
              currentConversationId="1"
              onNewChat={() => {
                console.log('New chat');
                setMessages([]);
              }}
              onSelectConversation={(id: string) => console.log('Selected:', id)}
              onDeleteConversation={(id: string) => console.log('Deleted:', id)}
              onRenameConversation={(id: string, title: string) => console.log('Renamed:', id, title)}
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
            className="flex items-center justify-between px-4 py-3 border-b-2 border-black/10 bg-white"
          >
            <div className="flex items-center gap-3">
              {/* Toggle Button */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setIsSideNavOpen(!isSideNavOpen)}
                className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-white border-2 border-black rounded-lg flex items-center justify-center hover:bg-black hover:text-white transition-colors`}
                aria-label="Toggle sidebar"
              >
                <svg
                  className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isSideNavOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </motion.button>

              {/* SOGA Title */}
              <h1 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-black uppercase tracking-wider`}>
                $ SOGA
              </h1>
            </div>
          </motion.div>
        )}

        {/* Desktop Toggle Button - Only when no messages */}
        {!isMobile && !hasMessages && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => setIsSideNavOpen(!isSideNavOpen)}
            className="absolute top-4 left-4 z-50 w-10 h-10 bg-white border-2 border-black rounded-lg flex items-center justify-center hover:bg-black hover:text-white transition-colors shadow-lg"
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isSideNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex-1 flex flex-col items-center justify-center p-6 bg-white"
          >
            <div className="w-full max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-center mb-8"
              >
                <h1 className="text-3xl font-bold text-black mb-2 uppercase tracking-wider">
                  $ SOGA
                </h1>
                <p className="text-black/60 text-sm">
                  &gt; Start a conversation by typing a message below
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
                  className="bg-white text-black px-6 py-3 border-b border-black"
                >
                  <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 bg-black animate-pulse"></div>
                        <div className="absolute inset-0 w-2 h-2 bg-black/50 animate-ping"></div>
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide">[ ASYNC SESSION RUNNING ]</p>
                        <p className="text-xs text-black/70 font-mono">
                          &gt; {messages[messages.length - 1]?.progressMessage || 'Processing your request...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Messages Area */}
            <div className={`flex-1 overflow-y-auto p-6 bg-white ${messages.length === 0 ? 'flex items-center justify-center' : ''}`}>
              <div className="max-w-3xl mx-auto w-full">
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="text-center"
                  >
                    <h1 className={`${isMobile ? 'text-4xl' : 'text-5xl'} font-bold text-black mb-4 uppercase tracking-wider`}>
                      $ SOGA
                    </h1>
                    <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-500 mb-2 font-mono tracking-wide`}>
                      Smart Orchestrated Glasses Agents
                    </p>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-black/60 mt-6 font-mono`}>
                      &gt; Start a conversation by typing a message below
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
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{
                            duration: 0.4,
                            ease: "easeOut",
                            delay: idx * 0.1
                          }}
                        >
                          {msg.role === 'user' ? (
                            <div className="flex justify-end">
                              <div className="max-w-[80%] px-4 py-3 bg-black text-white border-2 border-black rounded-2xl shadow-lg">
                                <p className="text-sm whitespace-pre-wrap font-mono">&gt; {msg.content}</p>
                              </div>
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
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
              className="border-t-2 border-black/10 bg-white"
            >
              <QueryPrompt
                isMobile={isMobile}
                onSendMessage={handleSendMessage}
                placeholder="$ Enter command..."
              />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default Test;