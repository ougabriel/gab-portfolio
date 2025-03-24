import { motion } from 'framer-motion'
import { FaGithub, FaExternalLinkAlt } from 'react-icons/fa'

interface ProjectProps {
  title: string
  description: string
  technologies: string[]
  image: string
  githubUrl?: string
  liveUrl?: string
}

export default function Project({
  title,
  description,
  technologies,
  image,
  githubUrl,
  liveUrl,
}: ProjectProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-light rounded-lg overflow-hidden"
    >
      <div className="relative h-48">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-dark to-transparent opacity-0 hover:opacity-100 transition-opacity">
          <div className="absolute bottom-4 left-4 right-4 flex justify-end space-x-4">
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-primary transition-colors"
              >
                <FaGithub className="w-6 h-6" />
              </a>
            )}
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-primary transition-colors"
              >
                <FaExternalLinkAlt className="w-6 h-6" />
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-gray-400 mb-4">{description}</p>
        <div className="flex flex-wrap gap-2">
          {technologies.map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 bg-dark rounded-full text-sm text-gray-300"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
} 