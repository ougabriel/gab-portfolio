import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Dialog } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import Home from './components/Home'
import About from './components/About'
import Project from './components/Project'
import Contact from './components/Contact'
import HireMe from './components/HireMe'
import Tools from './components/Tools'
import Certifications from './components/Certifications'
import ThemeToggle from './components/ThemeToggle'
import Admin from './components/Admin'
import SpaceGalaxy from './components/SpaceGalaxy'
import ProfileInfo from './components/ProfileInfo'
import Footer from './components/Footer'
import { authService } from './services/api'
import ProtectedRoute from './components/ProtectedRoute'

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Project', href: '/project' },
  { name: 'Tools', href: '/tools' },
  { name: 'Certifications', href: '/certifications' },
  { name: 'Hire Me', href: '/hire-me' },
  { name: 'Contact', href: '/contact' },
]

const handleDownloadCV = () => {
  const link = document.createElement('a')
  link.href = '/assets/GabrielOkomdevops25.pdf'
  link.download = 'GabrielOkomdevops25.pdf'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const AppContent: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const user = authService.getCurrentUser()

  return (
    <div className="min-h-screen bg-black">
      {isHomePage && <SpaceGalaxy show={true} />}
      <div className="relative z-10">
        {/* Navigation */}
        <motion.header 
          className="absolute inset-x-0 top-0 z-50"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
            <div className="flex lg:flex-1">
              <Link to="/" className="-m-1.5 p-1.5">
                <motion.span 
                  className="text-2xl font-bold text-white"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  DevOps Portfolio
                </motion.span>
              </Link>
            </div>
            <div className="hidden lg:flex lg:gap-x-12">
              {navigation.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    to={item.href}
                    className={`text-sm font-semibold leading-6 ${
                      location.pathname === item.href
                        ? "text-primary"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}
            </div>
            <div className="flex lg:hidden">
              <motion.button
                type="button"
                className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-white"
                onClick={() => setIsMobileMenuOpen(true)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <span className="sr-only">Open main menu</span>
                <Bars3Icon className="h-6 w-6" aria-hidden="true" />
              </motion.button>
            </div>
            <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:items-center lg:gap-x-4">
              <ThemeToggle />
              {user?.role === 'admin' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Link 
                    to="/admin" 
                    className="text-sm font-semibold text-white hover:text-primary-light"
                  >
                    Admin
                  </Link>
                </motion.div>
              )}
              <motion.button
                onClick={handleDownloadCV}
                className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300 inline-flex items-center"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download CV
              </motion.button>
            </div>
          </nav>
        </motion.header>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <Dialog 
              as={motion.div} 
              className="lg:hidden" 
              open={isMobileMenuOpen} 
              onClose={setIsMobileMenuOpen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="fixed inset-0 z-50" />
              <Dialog.Panel 
                as={motion.div}
                className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-white/10"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", duration: 0.3 }}
              >
                <div className="flex items-center justify-between">
                  <Link to="/" className="-m-1.5 p-1.5">
                    <span className="text-2xl font-bold text-white">DevOps Portfolio</span>
                  </Link>
                  <button
                    type="button"
                    className="-m-2.5 rounded-md p-2.5 text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span className="sr-only">Close menu</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-6 flow-root">
                  <div className="-my-6 divide-y divide-gray-500/10">
                    <div className="space-y-2 py-6">
                      {navigation.map((item, index) => (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.1 }}
                          whileHover={{ x: 5 }}
                        >
                          <Link
                            to={item.href}
                            className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-gray-800"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {item.name}
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                    <div className="py-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-gray-300">Theme</span>
                        <ThemeToggle />
                      </div>
                      {user?.role === 'admin' && (
                        <Link
                          to="/admin"
                          className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-gray-800"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          Admin
                        </Link>
                      )}
                      <motion.button
                        onClick={handleDownloadCV}
                        className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300 inline-flex items-center"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Download CV
                      </motion.button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Dialog>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="relative pt-24">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={
                <motion.div 
                  className="relative isolate"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
                    <div className="mx-auto max-w-2xl text-center">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="mb-8"
                      >
                        <ProfileInfo />
                      </motion.div>
                      <motion.h1
                        className="text-4xl font-bold tracking-tight text-white sm:text-6xl"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                      >
                        DevOps Engineer & Cloud Architect
                      </motion.h1>
                      <motion.p
                        className="mt-6 text-lg leading-8 text-gray-200"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                      >
                        Transforming infrastructure and operations through automation and cloud-native solutions.
                      </motion.p>
                      <motion.div 
                        className="mt-10 flex items-center justify-center gap-x-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                      >
                        <motion.a 
                          href="/hire-me" 
                          className="btn btn-primary relative overflow-hidden group"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="relative z-10">Hire Me</span>
                          <motion.div
                            className="absolute inset-0 bg-primary-light"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: 0 }}
                            transition={{ duration: 0.3 }}
                          />
                        </motion.a>
                        <motion.a 
                          href="/project" 
                          className="btn btn-secondary relative overflow-hidden group"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <span className="relative z-10">Read Project</span>
                          <motion.div
                            className="absolute inset-0 bg-gray-700"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: 0 }}
                            transition={{ duration: 0.3 }}
                          />
                        </motion.a>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              } />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <Admin />
                  </ProtectedRoute>
                }
              />
              <Route path="/about" element={<About />} />
              <Route path="/project" element={<Project />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/certifications" element={<Certifications />} />
              <Route path="/hire-me" element={<HireMe />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App 