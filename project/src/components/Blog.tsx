import React from 'react';
import { motion } from 'framer-motion';

interface BlogPost {
  title: string;
  date: string;
  image: string;
  excerpt: string;
  href: string;
}

const blogPosts: BlogPost[] = [
  {
    title: 'Implementing Zero-Trust Security in Kubernetes',
    date: '2024-03-15',
    image: 'https://picsum.photos/800/450',
    excerpt: 'Learn how to implement a zero-trust security model in your Kubernetes clusters...',
    href: '/blog/zero-trust-kubernetes',
  },
  {
    title: 'Scaling Microservices with AWS ECS',
    date: '2024-03-10',
    image: 'https://picsum.photos/800/451',
    excerpt: 'A comprehensive guide to scaling microservices using Amazon ECS...',
    href: '/blog/scaling-microservices-ecs',
  },
];

const Blog = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Blog</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Latest insights and tutorials
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {blogPosts.map((post, index) => (
            <motion.article
              key={post.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              <img
                src={post.image}
                alt={post.title}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <time className="text-sm text-gray-500 dark:text-gray-400">
                  {post.date}
                </time>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-2 mb-2">
                  {post.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {post.excerpt}
                </p>
                <a
                  href={post.href}
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Read more
                  <svg
                    className="w-4 h-4 ml-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Blog; 