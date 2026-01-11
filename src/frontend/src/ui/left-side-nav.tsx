import { useState, useEffect, useCallback } from 'react';
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
import { getConversations, deleteConversation, updateConversation, type ConversationListItem } from '../api/conversations';

interface SideNavProps {
  isMobile: boolean;
  currentConversationId?: string | null;
  userId: string;
  onNewChat?: () => void;
  onLoadConversation?: (id: string) => void;
  refreshTrigger?: number; // Timestamp to trigger refresh
}

function SideNav({
  isMobile,
  currentConversationId,
  userId,
  onNewChat,
  onLoadConversation,
  refreshTrigger
}: SideNavProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Memoize loadConversations to avoid useEffect dependency warnings
  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const convs = await getConversations(userId);
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load conversations on mount, when userId changes, or when refresh is triggered
  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshTrigger]);

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      await updateConversation(id, newTitle);
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, title: newTitle } : c)
      );
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupConversationsByDate = (convs: ConversationListItem[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    return {
      today: convs.filter(c => isSameDay(new Date(c.updatedAt), today)),
      yesterday: convs.filter(c => isSameDay(new Date(c.updatedAt), yesterday)),
      lastWeek: convs.filter(c => {
        const date = new Date(c.updatedAt);
        return date > lastWeek &&
          !isSameDay(date, today) &&
          !isSameDay(date, yesterday);
      }),
      older: convs.filter(c => new Date(c.updatedAt) <= lastWeek)
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
      handleRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const renderConversation = (conv: ConversationListItem) => {
    const isActive = conv.id === currentConversationId;
    const isHovered = hoveredId === conv.id;
    const isEditing = editingId === conv.id;

    return (
      <div
        key={conv.id}
        onMouseEnter={() => setHoveredId(conv.id)}
        onMouseLeave={() => setHoveredId(null)}
        className="group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-smooth"
        style={{
          backgroundColor: isActive ? 'var(--surface-elevated)' : 'transparent',
          borderLeft: isActive ? '2px solid var(--color-primary-500)' : '2px solid transparent',
          paddingLeft: isActive ? '10px' : '12px',
          color: isActive ? 'var(--color-gray-900)' : 'var(--color-gray-700)'
        }}
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
            className="flex-1 px-2 py-1 text-sm rounded focus-ring"
            style={{ 
              backgroundColor: 'var(--surface-base)',
              border: '1px solid var(--border-default)',
              color: 'var(--color-gray-900)'
            }}
            autoFocus
          />
        ) : (
          <>
            <MessageSquare className="w-4 h-4 shrink-0" style={{ opacity: 0.6 }} />
            <div
              className="flex-1 min-w-0"
              onClick={() => {
                onLoadConversation?.(conv.id);
                if (isMobile) setIsOpen(false);
              }}
            >
              <p className="text-sm font-medium truncate">{conv.title}</p>
            </div>

            {/* Action buttons - show on hover */}
            {isHovered && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(conv.id, conv.title);
                  }}
                  className="p-1 rounded transition-smooth"
                  style={{ 
                    backgroundColor: 'var(--surface-elevated)',
                    color: 'var(--color-gray-600)'
                  }}
                  title="Rename"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this conversation?')) {
                      handleDeleteConversation(conv.id);
                    }
                  }}
                  className="p-1 rounded transition-smooth"
                  style={{ 
                    backgroundColor: 'var(--color-destructive-500)',
                    color: 'white'
                  }}
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
      <div className="space-y-6 pb-4">
        {groups.today.length > 0 && (
          <div>
            <h3 
              className="px-3 text-xs font-semibold uppercase mb-2"
              style={{ 
                color: 'var(--color-gray-500)',
                letterSpacing: 'var(--tracking-wide)'
              }}
            >
              Today
            </h3>
            <div className="space-y-1">
              {groups.today.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.yesterday.length > 0 && (
          <div>
            <h3 
              className="px-3 text-xs font-semibold uppercase mb-2"
              style={{ 
                color: 'var(--color-gray-500)',
                letterSpacing: 'var(--tracking-wide)'
              }}
            >
              Yesterday
            </h3>
            <div className="space-y-1">
              {groups.yesterday.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.lastWeek.length > 0 && (
          <div>
            <h3 
              className="px-3 text-xs font-semibold uppercase mb-2"
              style={{ 
                color: 'var(--color-gray-500)',
                letterSpacing: 'var(--tracking-wide)'
              }}
            >
              Last 7 Days
            </h3>
            <div className="space-y-1">
              {groups.lastWeek.map(renderConversation)}
            </div>
          </div>
        )}

        {groups.older.length > 0 && (
          <div>
            <h3 
              className="px-3 text-xs font-semibold uppercase mb-2"
              style={{ 
                color: 'var(--color-gray-500)',
                letterSpacing: 'var(--tracking-wide)'
              }}
            >
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
    <div 
      className="flex flex-col h-full glass-effect"
      style={{ 
        borderRight: '1px solid var(--border-subtle)'
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <h1 className="text-base font-semibold" style={{ color: 'var(--color-gray-900)', letterSpacing: 'var(--tracking-tight)' }}>Conversations</h1>
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg transition-smooth focus-ring"
            style={{ 
              backgroundColor: 'var(--surface-elevated)',
              color: 'var(--color-gray-600)'
            }}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={() => {
            onNewChat?.();
            loadConversations(); // Refresh conversation history
            if (isMobile) setIsOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-white font-medium transition-smooth active:scale-95 focus-ring"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
            style={{ color: 'var(--color-gray-400)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg transition-smooth focus-ring"
            style={{ 
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--color-gray-900)'
            }}
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 mb-3 rounded-xl gradient-primary flex items-center justify-center animate-pulse">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>Loading conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div 
              className="w-12 h-12 mb-3 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface-elevated)' }}
            >
              <MessageSquare className="w-6 h-6" style={{ color: 'var(--color-gray-400)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-gray-700)' }}>
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-gray-500)' }}>
              {searchQuery ? 'Try a different search' : 'Start a new chat to begin'}
            </p>
          </div>
        ) : (
          renderConversationGroups()
        )}
      </div>

      {/* Settings Footer */}
      <div 
        className="p-4"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <button 
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-smooth"
          style={{ 
            color: 'var(--color-gray-700)',
            backgroundColor: 'transparent'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-elevated)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
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
