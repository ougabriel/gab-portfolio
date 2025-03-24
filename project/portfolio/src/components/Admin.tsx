import { motion } from 'framer-motion'
import { useState } from 'react'
import { FaUsers, FaEnvelope, FaChartBar, FaCog } from 'react-icons/fa'

export default function Admin() {
  const [activeTab, setActiveTab] = useState('dashboard')

  const tabs = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: FaChartBar,
    },
    {
      id: 'users',
      name: 'Users',
      icon: FaUsers,
    },
    {
      id: 'messages',
      name: 'Messages',
      icon: FaEnvelope,
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: FaCog,
    },
  ]

  return (
    <div className="min-h-screen bg-dark">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-dark-light min-h-screen p-4">
          <h2 className="text-xl font-bold mb-8">Admin Panel</h2>
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-dark'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.name}</span>
              </motion.button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-dark-light rounded-lg p-6"
          >
            <h1 className="text-2xl font-bold mb-6">
              {tabs.find((tab) => tab.id === activeTab)?.name}
            </h1>
            <div className="text-gray-300">
              {activeTab === 'dashboard' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-dark p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">Total Users</h3>
                    <p className="text-3xl font-bold text-primary">1,234</p>
                  </div>
                  <div className="bg-dark p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">Messages</h3>
                    <p className="text-3xl font-bold text-primary">56</p>
                  </div>
                  <div className="bg-dark p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">Projects</h3>
                    <p className="text-3xl font-bold text-primary">12</p>
                  </div>
                </div>
              )}
              {activeTab === 'users' && <p>User management content</p>}
              {activeTab === 'messages' && <p>Message management content</p>}
              {activeTab === 'settings' && <p>Settings content</p>}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
} 