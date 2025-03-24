import { motion } from 'framer-motion'
import { FaCode, FaServer, FaCloud, FaRocket } from 'react-icons/fa'

export default function HireMe() {
  const services = [
    {
      title: 'Frontend Development',
      description: 'Building responsive and interactive web applications using React, TypeScript, and modern frontend technologies.',
      icon: FaCode,
    },
    {
      title: 'Backend Development',
      description: 'Developing scalable server-side applications with Node.js, Python, and various databases.',
      icon: FaServer,
    },
    {
      title: 'DevOps & Cloud',
      description: 'Setting up and managing cloud infrastructure, CI/CD pipelines, and containerized applications.',
      icon: FaCloud,
    },
    {
      title: 'Technical Consulting',
      description: 'Providing expert advice on architecture, technology stack selection, and best practices.',
      icon: FaRocket,
    },
  ]

  return (
    <div className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4"
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Let's Work Together</h2>
          <p className="text-gray-300 text-lg">
            I'm available for freelance work and full-time opportunities.
            Let's create something amazing together!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-dark-light p-6 rounded-lg"
            >
              <service.icon className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{service.title}</h3>
              <p className="text-gray-400">{service.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <motion.a
            href="/contact"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block px-8 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Get in Touch
          </motion.a>
        </div>
      </motion.div>
    </div>
  )
} 