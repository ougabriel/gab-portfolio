import { motion } from 'framer-motion';

const certifications = [
  {
    name: 'GitHub Foundations Certification',
    issuer: 'GitHub',
    date: '2023',
    description: 'Fundamental understanding of Git and GitHub workflows',
    icon: '📚'
  },
  {
    name: 'GitHub Actions Certification',
    issuer: 'GitHub',
    date: '2023',
    description: 'Expertise in CI/CD automation using GitHub Actions',
    icon: '⚡'
  },
  {
    name: 'Microsoft Certified Azure DevOps Expert AZ-400',
    issuer: 'Microsoft',
    date: '2023',
    description: 'Advanced DevOps practices and Azure implementation',
    icon: '🔧'
  },
  {
    name: 'Microsoft Certified Azure Administrator AZ-104',
    issuer: 'Microsoft',
    date: '2023',
    description: 'Azure infrastructure management and administration',
    icon: '⚙️'
  },
  {
    name: 'Microsoft Certified Developer Associate AZ-204',
    issuer: 'Microsoft',
    date: '2023',
    description: 'Azure cloud application development',
    icon: '💻'
  },
  {
    name: 'Microsoft Certified Security Operation Analyst SC-200',
    issuer: 'Microsoft',
    date: '2023',
    description: 'Security operations and threat management',
    icon: '🔒'
  },
  {
    name: 'Google Certified IT Support',
    issuer: 'Google',
    date: '2023',
    description: 'IT infrastructure and support fundamentals',
    icon: '🛠️'
  },
  {
    name: 'AWS Solution Architect',
    issuer: 'Amazon Web Services',
    date: 'In Progress',
    description: 'Cloud architecture and AWS services',
    icon: '☁️'
  }
];

const Certifications = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-12 max-w-6xl"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Certifications</h1>
        <p className="text-gray-300 text-lg">
          Professional certifications and qualifications demonstrating expertise in cloud computing, 
          DevOps practices, and technical solutions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {certifications.map((cert, index) => (
          <motion.div
            key={cert.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 hover:shadow-2xl transition-shadow duration-300"
          >
            <div className="flex items-start space-x-4">
              <div className="text-4xl">{cert.icon}</div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {cert.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-2">{cert.issuer}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{cert.date}</p>
                <p className="text-gray-700 dark:text-gray-300">{cert.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <motion.a
          href="/hire-me"
          className="inline-block bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          View Full CV
        </motion.a>
      </div>
    </motion.div>
  );
};

export default Certifications; 