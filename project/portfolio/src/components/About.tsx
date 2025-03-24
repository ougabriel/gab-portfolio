import { motion } from 'framer-motion'
import { FaCode, FaServer, FaCloud } from 'react-icons/fa'

export default function About() {
  const experiences = [
    {
      title: 'Senior Full Stack Developer',
      company: 'Tech Company',
      period: '2020 - Present',
      description: 'Led development of multiple web applications using React, Node.js, and cloud technologies.',
      icon: FaCode,
    },
    {
      title: 'Backend Developer',
      company: 'Startup',
      period: '2018 - 2020',
      description: 'Developed and maintained server-side applications using Node.js and Python.',
      icon: FaServer,
    },
    {
      title: 'DevOps Engineer',
      company: 'Enterprise',
      period: '2016 - 2018',
      description: 'Managed cloud infrastructure and implemented CI/CD pipelines using AWS and Docker.',
      icon: FaCloud,
    },
  ]

  return (
    <div className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto px-4"
      >
        <h2 className="text-3xl font-bold text-center mb-8">About Me</h2>
        <div className="prose prose-invert max-w-none">
          <p className="text-gray-300 mb-8">
            I am a passionate full-stack developer with expertise in building scalable web applications
            and implementing efficient DevOps practices. With several years of experience in the industry,
            I have worked on various projects ranging from small startups to large enterprises.
          </p>
          <p className="text-gray-300 mb-12">
            My technical skills include frontend development with React and TypeScript, backend development
            with Node.js and Python, and cloud infrastructure management with AWS. I am also experienced
            in implementing CI/CD pipelines, containerization with Docker, and microservices architecture.
          </p>
        </div>

        <h3 className="text-2xl font-bold mb-6">Experience</h3>
        <div className="space-y-8">
          {experiences.map((exp, index) => (
            <motion.div
              key={exp.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex items-start space-x-4"
            >
              <div className="flex-shrink-0">
                <exp.icon className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h4 className="text-xl font-semibold">{exp.title}</h4>
                <p className="text-gray-400">{exp.company}</p>
                <p className="text-sm text-gray-500">{exp.period}</p>
                <p className="mt-2 text-gray-300">{exp.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
} 