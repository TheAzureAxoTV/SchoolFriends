import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  user: string;
  avatar: string;
  text: string;
  timestamp: string;
}

interface Channel {
  id: string;
  name: string;
  icon: string;
}

const CHANNELS: Channel[] = [
  { id: 'general', name: 'general', icon: 'hashtag' },
  { id: 'homework', name: 'homework', icon: 'book' },
  { id: 'announcements', name: 'announcements', icon: 'bullhorn' },
];

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel>(CHANNELS[0]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      user: 'Alex',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex',
      text: 'Hey everyone! Welcome to SchoolFriends.',
      timestamp: '10:42 AM',
    },
    {
      id: '2',
      user: 'Sarah',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sarah',
      text: 'Is the math assignment due tomorrow or Friday?',
      timestamp: '10:44 AM',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSelectChannel = (channel: Channel) => {
    setActiveChannel(channel);
    setIsSidebarOpen(false);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      user: 'You',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=You',
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText('');
  };

  return (
    <div className="flex h-full w-full bg-[#313338] text-[#dbdee1] overflow-hidden relative">

      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`
          fixed md:relative z-50 h-full w-72 bg-[#2b2d31] border-r border-black/20
          flex flex-col transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Server Header */}
        <div className="h-14 px-4 border-b border-black/20 flex items-center justify-between shrink-0 font-bold text-white shadow-sm">
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-graduation-cap text-indigo-400"></i>
            SchoolFriends
          </span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden text-[#949ba4] hover:text-white p-1"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Channel List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scroll-container">
          <div className="px-2 mb-1 text-xs font-semibold uppercase tracking-wider text-[#949ba4]">
            Text Channels
          </div>
          {CHANNELS.map((channel) => {
            const isActive = activeChannel.id === channel.id;
            return (
              <button
                key={channel.id}
                onClick={() => handleSelectChannel(channel)}
                className={`
                  w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors
                  ${isActive ? 'bg-[#404249] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}
                `}
              >
                <i className={`fa-solid fa-${channel.icon}`}></i>
                <span>{channel.name}</span>
              </button>
            );
          })}
        </div>

        {/* User Footer Bar */}
        <div className="bg-[#1e1f22] p-2 flex items-center justify-between">
          <div className="flex items-center gap-2 px-1">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=You" alt="Avatar" className="w-8 h-8 rounded-full bg-slate-600" />
            <div className="text-xs">
              <div className="font-semibold text-white leading-tight">You</div>
              <div className="text-[#949ba4] text-[10px]">#0001</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat View */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative bg-[#313338]">

        {/* Header Bar */}
        <header className="h-14 px-4 bg-[#313338] border-b border-black/20 flex items-center gap-3 shrink-0 z-10 shadow-sm">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-1.5 text-[#949ba4] hover:text-white"
            aria-label="Open Channels"
          >
            <i className="fa-solid fa-bars text-lg"></i>
          </button>
          <div className="flex items-center gap-2 font-bold text-white">
            <span className="text-[#949ba4] text-xl">#</span>
            <span>{activeChannel.name}</span>
          </div>
        </header>

        {/* Message Feed Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-container">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3 group hover:bg-black/10 -mx-4 px-4 py-1 rounded transition-colors">
              <img
                src={msg.avatar}
                alt={msg.user}
                className="w-10 h-10 rounded-full bg-slate-700 mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white text-sm">{msg.user}</span>
                  <span className="text-[10px] text-[#949ba4]">{msg.timestamp}</span>
                </div>
                <p className="text-sm text-[#dbdee1] mt-0.5 break-words">{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Footer */}
        <footer
          className="shrink-0 bg-[#313338] p-3 border-t border-black/10"
          style={{
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <form onSubmit={handleSendMessage} className="bg-[#2b2d31] rounded-lg flex items-center px-3 py-2 gap-2 border border-transparent focus-within:border-indigo-500/50">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message #${activeChannel.name}`}
              className="w-full bg-transparent text-[#dbdee1] placeholder-[#949ba4] text-[16px] focus:outline-none py-1"
            />
            <button
              type="submit"
              className="text-indigo-400 hover:text-indigo-300 p-1 shrink-0"
            >
              <i className="fa-solid fa-paper-plane text-base"></i>
            </button>
          </form>
        </footer>

      </main>
    </div>
  );
}
