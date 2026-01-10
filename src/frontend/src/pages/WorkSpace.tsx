import { useState } from "react";
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
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
        onSelectConversation={(id) => console.log('Selected:', id)}
        onDeleteConversation={(id) => console.log('Deleted:', id)}
        onRenameConversation={(id, title) => console.log('Renamed:', id, title)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen">
        {/* Desktop: Center prompt when no messages, Mobile: Always at bottom */}
        {!isMobile && !hasMessages ? (
          /* Desktop centered layout - no messages yet */
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-3xl">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-semibold text-gray-800 mb-2">
                  Welcome to your workspace
                </h1>
                <p className="text-gray-500">
                  Start a conversation by typing a message below
                </p>
              </div>

              {/* Centered Query Prompt */}
              <QueryPrompt
                isMobile={isMobile}
                onSendMessage={handleSendMessage}
                placeholder="Type your message..."
              />
            </div>
          </div>
        ) : (
          /* Desktop with messages OR Mobile (always this layout) */
          <>
            {/* Async Session Running Indicator */}
            {isAgentRunning && (
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 border-b border-blue-700">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <div className="absolute inset-0 w-2 h-2 bg-white rounded-full animate-ping"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Async Agent Session Running</p>
                      <p className="text-xs text-blue-100">
                        {messages[messages.length - 1]?.progressMessage || 'Processing your request...'}
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
              </div>
            )}

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                {!isMobile && messages.length === 0 && (
                  <div className="text-center py-12">
                    <h1 className="text-3xl font-semibold text-gray-800 mb-2">
                      Welcome to your workspace
                    </h1>
                    <p className="text-gray-500">
                      Start a conversation by typing a message below
                    </p>
                  </div>
                )}

                {/* Messages Display */}
                {messages.length > 0 && (
                  <div className="space-y-6">
                    {messages.map((msg, idx) => (
                      <div key={idx}>
                        {msg.role === 'user' ? (
                          <div className="flex justify-end">
                            <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-black text-white">
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        ) : (
                          <AgentMessage
                            content={msg.content}
                            isProcessing={msg.isProcessing}
                            progressMessage={msg.progressMessage}
                          />
                        )}
                      </div>
                    ))}
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
            <div className="border-t border-gray-200 bg-white">
              <QueryPrompt
                isMobile={isMobile}
                onSendMessage={handleSendMessage}
                placeholder="Type your message..."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Test;