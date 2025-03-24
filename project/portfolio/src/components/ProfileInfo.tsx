import { motion } from 'framer-motion'
import { FaCode, FaServer, FaCloud } from 'react-icons/fa'

export default function ProfileInfo() {
  const skills = [
    {
      category: 'Frontend Development',
      icon: FaCode,
      items: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js', 'HTML5', 'CSS3'],
    },
    {
      category: 'Backend Development',
      icon: FaServer,
      items: ['Node.js', 'Express', 'Python', 'Django', 'REST APIs', 'GraphQL'],
    },
    {
      category: 'DevOps & Cloud',
      icon: FaCloud,
      items: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Jenkins', 'Git'],
    },
  ]

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold mb-4">Gabriel Okom</h1>
        <p className="text-xl text-gray-400">Full Stack Developer & DevOps Engineer</p>
        <p className="mt-4 text-gray-300 max-w-2xl mx-auto">
          Passionate developer with expertise in building scalable web applications
          and implementing efficient DevOps practices. Specialized in cloud infrastructure
          and automation.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {skills.map((skill, index) => (
          <motion.div
            key={skill.category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-dark-light p-6 rounded-lg"
          >
            <skill.icon className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">{skill.category}</h3>
            <ul className="space-y-2">
              {skill.items.map((item) => (
                <li key={item} className="text-gray-400">
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  )
} 