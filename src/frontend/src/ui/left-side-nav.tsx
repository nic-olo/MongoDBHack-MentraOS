import { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Search,
  Settings,
  Menu,
  X,
  Trash2,
  Edit3
} from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  preview?: string;
}

interface SideNavProps {
  isMobile: boolean;
  conversations?: Conversation[];
  currentConversationId?: string;
  onNewChat?: () => void;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
}

function SideNav({
  isMobile,
  conversations = [],
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation
}: SideNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupConversationsByDate = (convs: Conversation[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    return {
      today: convs.filter(c => isSameDay(c.timestamp, today)),
      yesterday: convs.filter(c => isSameDay(c.timestamp, yesterday)),
      lastWeek: convs.filter(c =>
        c.timestamp > lastWeek &&
        !isSameDay(c.timestamp, today) &&
        !isSameDay(c.timestamp, yesterday)
      ),
      older: convs.filter(c => c.timestamp <= lastWeek)
    };
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString();
  };

  const handleStartEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation?.(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const renderConversation = (conv: Conversation) => {
    const isActive = conv.id === currentConversationId;
    const isHovered = hoveredId === conv.id;
    const isEditing = editingId === conv.id;

    return (
      <div
        key={conv.id}
        onMouseEnter={() => setHoveredId(conv.id)}
        onMouseLeave={() => setHoveredId(null)}
        className={`
          group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
          transition-all duration-150
          ${isActive
            ? 'bg-gray-100 text-black'
            : 'hover:bg-gray-50 text-gray-700'
          }
        `}
      >
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => handleSaveEdit(conv.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit(conv.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            className="flex-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:border-black"
            autoFocus
          />
        ) : (
          <>
            <MessageSquare className="w-4 h-4 shrink-0" />
            <div
              className="flex-1 min-w-0"
              onClick={() => onSelectConversation?.(conv.id)}
            >
              <p className="text-sm font-medium truncate">{conv.title}</p>
              {conv.preview && (
                <p className="text-xs text-gray-500 truncate">{conv.preview}</p>
              )}
            </div>

            {/* Action buttons - show on hover */}
            {isHovered && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(conv.id, conv.title);
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title="Rename"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation?.(conv.id);
                  }}
                  className="p-1 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderConversationGroups = () => {
    const groups = groupConversationsByDate(filteredConversations);

    return (
      <div className="space-y-4">
        {groups.today.length > 0 && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Today
            </h3>
            <div className="space-y-1">
              {groups.today.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.yesterday.length > 0 && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Yesterday
            </h3>
            <div className="space-y-1">
              {groups.yesterday.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.lastWeek.length > 0 && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Last 7 Days
            </h3>
            <div className="space-y-1">
              {groups.lastWeek.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.older.length > 0 && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Older
            </h3>
            <div className="space-y-1">
              {groups.older.map(renderConversation)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold">Chats</h1>
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={() => {
            onNewChat?.();
            if (isMobile) setIsOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">New Chat</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-3">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 px-4">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            <p className="text-xs mt-1">
              {searchQuery ? 'Try a different search' : 'Start a new chat to begin'}
            </p>
          </div>
        ) : (
          renderConversationGroups()
        )}
      </div>

      {/* Settings Footer */}
      <div className="p-3 border-t border-gray-200">
        <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
          <Settings className="w-4 h-4" />
          <span className="text-sm font-medium">Settings</span>
        </button>
      </div>
    </div>
  );

  // Mobile: Drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Menu Button */}
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 left-4 z-40 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Overlay */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40 transition-opacity"
              onClick={() => setIsOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] z-50 shadow-2xl">
              {sidebarContent}
            </div>
          </>
        )}
      </>
    );
  }

  // Desktop: Fixed sidebar
  return (
    <div className="w-64 h-screen shrink-0">
      {sidebarContent}
    </div>
  );
}

export default SideNav;
