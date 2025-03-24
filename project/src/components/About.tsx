import { motion } from 'framer-motion';

const About = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12"
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">About Me</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Transforming Complex Challenges into Scalable Solutions
          </p>
        </div>

        <div className="space-y-8">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Professional Journey
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              I'm Gabriel Okom, a DevOps Engineer who thrives at the intersection of automation, cloud infrastructure, and scalable architectures. For me, technology is more than just a tool; it's a force multiplier, a way to break down complex challenges and create systems that don't just work but evolve, adapt, and scale effortlessly.
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              My journey into DevOps is fueled by my obsession with efficiency. I see every bottleneck as an opportunity and every failure as a lesson in resilience. From optimizing CI/CD pipelines that reduce deployment times by 70% to designing self-healing cloud environments that ensure 99.99% uptime, I approach every challenge with a blend of grit, creativity, and data-driven precision.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Business Impact & Innovation
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              But technology alone doesn't drive success; systems thinking does. I draw inspiration from top business models like Amazon's relentless customer obsession, Toyota's Kaizen approach to continuous improvement, and Netflix's culture of innovation. Whether I'm designing fault-tolerant Kubernetes clusters or implementing zero-downtime deployments, I always think in terms of scalability, reliability, and long-term value.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Customer Focus</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">Amazon-inspired approach to user-centric solutions</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Continuous Improvement</h3>
                <p className="text-sm text-green-700 dark:text-green-300">Toyota's Kaizen methodology for ongoing optimization</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Innovation Culture</h3>
                <p className="text-sm text-purple-700 dark:text-purple-300">Netflix-style approach to creative problem-solving</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Beyond Code
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              When I'm not optimizing infrastructure or diving deep into cloud security, I'm probably:
            </p>
            <ul className="space-y-3 text-gray-600 dark:text-gray-300">
              <li className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Solving complex problems, whether it's debugging intricate network issues or tackling chess puzzles
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Writing & sharing knowledge, documenting DevOps workflows on my <a href="https://ougabriel.medium.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Medium blog</a>
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Exploring psychology & philosophy, studying how mindset shifts drive innovation
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Pushing my limits, whether it's endurance training or fine-tuning technical solutions
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Let's Build the Future
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              I believe that the best systems aren't just built; they're engineered for adaptability. If you're looking for someone who thrives in high-pressure environments, thinks in systems, and loves turning complexity into clarity, let's connect. Whether it's DevOps, cloud infrastructure, or automation, I'm always eager to collaborate on projects that push the boundaries of what's possible.
            </p>
            <div className="flex justify-center">
              <a
                href="#contact"
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
              >
                Let's Connect
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default About; 