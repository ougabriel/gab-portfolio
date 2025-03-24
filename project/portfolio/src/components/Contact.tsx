import { motion } from 'framer-motion'
import { useState } from 'react'
import { FaGithub, FaLinkedin, FaTwitter, FaEnvelope } from 'react-icons/fa'

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission here
    console.log('Form submitted:', formData)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const socialLinks = [
    {
      name: 'GitHub',
      href: 'https://github.com/gabrielokom',
      icon: FaGithub,
    },
    {
      name: 'LinkedIn',
      href: 'https://linkedin.com/in/gabrielokom',
      icon: FaLinkedin,
    },
    {
      name: 'Twitter',
      href: 'https://twitter.com/gabrielokom',
      icon: FaTwitter,
    },
    {
      name: 'Email',
      href: 'mailto:gabriel.okom@example.com',
      icon: FaEnvelope,
    },
  ]

  return (
    <div className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4"
      >
        <h2 className="text-3xl font-bold text-center mb-8">Get in Touch</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold mb-4">Contact Information</h3>
            <p className="text-gray-300 mb-6">
              I'm always open to discussing new projects, creative ideas, or
              opportunities to be part of your visions.
            </p>
            <div className="space-y-4">
              {socialLinks.map((link) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  className="flex items-center space-x-3 text-gray-300 hover:text-primary transition-colors"
                >
                  <link.icon className="w-5 h-5" />
                  <span>{link.name}</span>
                </motion.a>
              ))}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-light rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-dark-light rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 bg-dark-light rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
            >
              Send Message
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  )
} 