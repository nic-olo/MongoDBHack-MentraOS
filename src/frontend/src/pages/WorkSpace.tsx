import { useState } from "react";
import QueryPrompt from "../ui/query-prompt";
import SideNav from "../ui/left-side-nav";
import { isMobileDevice } from "../util/deviceDetection";
import { queryMasterAgent, getDisplayContent } from "../api/masterAgent";

interface WorkSpaceProps {
  userId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  resultType?: 'direct_response' | 'clarifying_question' | 'agent_result';
  isProcessing?: boolean;
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

  const hasMessages = messages.length > 0;

  const handleSendMessage = async (message: string) => {
    console.log('Sent:', message);

    // Add user message to the list
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    // Add processing message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Processing your query...',
      isProcessing: true
    }]);

    setIsLoading(true);

    try {
      // Use userId from props (passed from App.tsx via useMentraAuth)
      const result = await queryMasterAgent(
        userId,
        message,
        (progressMessage) => {
          console.log('Progress:', progressMessage);
          // Update processing message with progress
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.isProcessing) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: progressMessage
              };
            }
            return updated;
          });
        }
      );

      // Remove processing message and add actual response
      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);

        if (result.status === 'completed' && result.result) {
          // Use webviewContent for full display
          const content = getDisplayContent(result.result, false);

          return [...withoutProcessing, {
            role: 'assistant',
            content,
            resultType: result.result.type,
            agentSpawned: result.agentSpawned,
            processingTimeMs: result.processingTimeMs
          }];
        } else if (result.status === 'failed') {
          return [...withoutProcessing, {
            role: 'assistant',
            content: `Error: ${result.error || 'Task failed'}`
          }];
        } else {
          return [...withoutProcessing, {
            role: 'assistant',
            content: 'Task did not complete successfully'
          }];
        }
      });

      console.log('Master Agent full response:', result);

      // Log result type for debugging
      if (result.result) {
        console.log('Result type:', result.result.type);
        console.log('Glasses display:', result.result.glassesDisplay);
        console.log('Agent spawned:', result.agentSpawned);
      }
    } catch (error) {
      console.error('Master Agent Error:', error);

      // Remove processing message and add error
      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);
        return [...withoutProcessing, {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Render assistant message based on type
  const renderAssistantMessage = (msg: Message, idx: number) => {
    // Show processing state
    if (msg.isProcessing) {
      return (
        <div key={idx} className="space-y-4">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Working on your request...</h3>
                <p className="text-sm text-gray-500">{msg.content}</p>
              </div>
            </div>

            {/* Progress Animation */}
            <div className="space-y-3 mt-4">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <div className="mt-1">
                  <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Processing...</p>
                  <p className="text-xs text-gray-500 mt-1">AI is analyzing your request</p>
                </div>
              </div>
            </div>
          </div>
        </div>
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

    // Direct response - simple styling
    return (
      <div key={idx} className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="flex-1 prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-800">{msg.content}</div>
            </div>
          </div>
        </div>
      </div>
    );
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
                disabled={isLoading}
              />
            </div>
          </div>
        ) : (
          /* Desktop with messages OR Mobile (always this layout) */
          <>
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
                          renderAssistantMessage(msg, idx)
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
                disabled={isLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default WorkSpace;
