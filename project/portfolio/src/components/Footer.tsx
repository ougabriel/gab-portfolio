import { motion } from 'framer-motion'
import { FaGithub, FaLinkedin, FaTwitter } from 'react-icons/fa'

export default function Footer() {
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
  ]

  return (
    <footer className="bg-dark-light py-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-6">
            {socialLinks.map((link) => (
              <motion.a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="text-gray-400 hover:text-primary transition-colors"
              >
                <span className="sr-only">{link.name}</span>
                <link.icon className="h-6 w-6" />
              </motion.a>
            ))}
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} Gabriel Okom. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
} 