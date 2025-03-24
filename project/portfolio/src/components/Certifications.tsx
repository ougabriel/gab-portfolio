import { motion } from 'framer-motion'
import { FaAward, FaCertificate, FaGraduationCap } from 'react-icons/fa'

export default function Certifications() {
  const certifications = [
    {
      title: 'AWS Certified Solutions Architect',
      issuer: 'Amazon Web Services',
      date: '2023',
      description: 'Professional certification for designing distributed systems on AWS. Expertise in cloud architecture and infrastructure.',
      icon: FaAward,
    },
    {
      title: 'Docker Certified Associate',
      issuer: 'Docker',
      date: '2023',
      description: 'Certification for containerization and container orchestration. Advanced knowledge in Docker and container management.',
      icon: FaCertificate,
    },
    {
      title: 'Professional Full Stack Developer',
      issuer: 'Meta',
      date: '2022',
      description: 'Comprehensive certification covering frontend and backend development. Mastery of modern web development practices.',
      icon: FaGraduationCap,
    },
  ]

  return (
    <div className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4"
      >
        <h2 className="text-3xl font-bold text-center mb-8">Certifications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certifications.map((cert, index) => (
            <motion.div
              key={cert.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-dark-light p-6 rounded-lg"
            >
              <cert.icon className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{cert.title}</h3>
              <p className="text-gray-400 mb-1">{cert.issuer}</p>
              <p className="text-sm text-gray-500 mb-4">{cert.date}</p>
              <p className="text-gray-300">{cert.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
} 