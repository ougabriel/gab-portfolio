import React from 'react'
import { motion } from 'framer-motion'
import PageTitle from './PageTitle'

const Projects: React.FC = () => {
  const projects = [
    {
      title: "E-Commerce Platform",
      description: "A full-stack e-commerce solution with real-time inventory management and payment processing.",
      technologies: ["React", "Node.js", "MongoDB", "Stripe"],
      image: "/project1.jpg"
    },
    {
      title: "Task Management App",
      description: "A collaborative task management application with real-time updates and team features.",
      technologies: ["Vue.js", "Express", "PostgreSQL", "Socket.io"],
      image: "/project2.jpg"
    },
    {
      title: "Portfolio Website",
      description: "A modern, responsive portfolio website with smooth animations and dark mode.",
      technologies: ["React", "Tailwind CSS", "Framer Motion"],
      image: "/project3.jpg"
    }
  ]

  return (
    <div className="min-h-screen bg-[#0a0118] text-white">
      <div className="container mx-auto px-4 py-20">
        <PageTitle 
          title="My Projects" 
          subtitle="Explore some of my recent work"
        />

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project, index) => (
            <motion.div
              key={project.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0118] via-transparent to-transparent opacity-50" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                  {project.title}
                </h3>
                <p className="mt-2 text-white/70">
                  {project.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {project.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1 rounded-full text-sm bg-white/5 text-white/80"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Projects 