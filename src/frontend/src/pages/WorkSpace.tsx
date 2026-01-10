import { useState } from "react";
import QueryPrompt from "../ui/query-prompt";
import SideNav from "../ui/left-side-nav";
import { isMobileDevice } from "../util/deviceDetection";
import { queryMasterAgent } from "../api/masterAgent";

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
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [transcriptions] = useState<Transcription[]>([]);

  const hasMessages = messages.length > 0;

  const handleSendMessage = async (message: string) => {
    console.log('Sent:', message);

    // Add user message to the list
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    // Add processing message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Processing your query...'
    }]);

    try {
      // TODO: Get actual userId from auth context (use useMentraAuth hook)
      const result = await queryMasterAgent(
        'user_123',
        message,
        (progressMessage) => {
          console.log('Progress:', progressMessage);
          // Optionally update the processing message
        }
      );

      // Remove processing message and add actual response
      setMessages(prev => {
        const withoutProcessing = prev.slice(0, -1);

        if (result.status === 'completed' && result.result) {
          return [...withoutProcessing, {
            role: 'assistant',
            content: result.result.synthesis
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
                          <div className="space-y-4">
                            {/* Coding in Progress State */}
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
                                  <p className="text-sm text-gray-500">AI is coding right now</p>
                                </div>
                              </div>

                              {/* Progress Steps */}
                              <div className="space-y-3 mt-4">
                                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                                  <div className="mt-1">
                                    <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-700">Analyzing your requirements</p>
                                    <p className="text-xs text-gray-500 mt-1">Understanding the task and planning the implementation</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 opacity-60">
                                  <div className="mt-1">
                                    <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-700">Writing the code</p>
                                    <p className="text-xs text-gray-500 mt-1">Creating optimized and clean code for your solution</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 opacity-40">
                                  <div className="mt-1">
                                    <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-700">Testing & validation</p>
                                    <p className="text-xs text-gray-500 mt-1">Ensuring everything works perfectly</p>
                                  </div>
                                </div>
                              </div>

                              {/* Code Preview (Optional) */}
                              <div className="mt-4 p-4 bg-gray-900 rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                  <span className="ml-2 text-xs text-gray-400">workspace.tsx</span>
                                </div>
                                <div className="space-y-2 font-mono text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">1</span>
                                    <span className="text-purple-400">import</span>
                                    <span className="text-gray-300">&#123; useState &#125;</span>
                                    <span className="text-purple-400">from</span>
                                    <span className="text-green-400">"react"</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">2</span>
                                    <span className="text-gray-500">//</span>
                                    <span className="text-gray-500 animate-pulse">Generating code...</span>
                                  </div>
                                  <div className="flex items-center gap-2 opacity-50">
                                    <span className="text-gray-500">3</span>
                                    <span className="text-blue-400">const</span>
                                    <span className="text-gray-300">handleRequest</span>
                                    <span className="text-purple-400">=</span>
                                  </div>
                                </div>
                              </div>

                              {/* Instruction/Info Box */}
                              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-start gap-3">
                                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                  <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-blue-900 mb-1">What's happening?</h4>
                                    <p className="text-xs text-blue-700 leading-relaxed">
                                      The AI is analyzing your request, exploring the codebase, and writing optimized code.
                                      This process ensures high-quality results tailored to your project structure.
                                      You'll see the complete implementation once it's ready.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
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