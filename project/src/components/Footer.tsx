import React from 'react';
import { FaGithub, FaLinkedin, FaEnvelope } from 'react-icons/fa';
import { SiMedium } from 'react-icons/si';
import { RiTwitterXFill } from 'react-icons/ri';

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#0a0118]/80 backdrop-blur-sm border-t border-white/10 text-white py-8 mt-20">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Contact Info */}
          <div>
            <h3 className="text-xl font-bold mb-4">Contact</h3>
            <div className="space-y-3 text-gray-300">
              <p className="font-medium">Gabriel Okom</p>
              <div className="flex items-center space-x-2">
                <FaEnvelope className="w-5 h-5" />
                <a href="mailto:ougabriel@gmail.com" className="hover:text-white transition-colors">
                  ougabriel@gmail.com
                </a>
              </div>
              <p>DevOps Engineer & Cloud Architect</p>
              <p>London, UK</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xl font-bold mb-4">Quick Links</h3>
            <div className="space-y-2">
              <a href="#home" className="block text-gray-300 hover:text-white transition-colors">Home</a>
              <a href="#about" className="block text-gray-300 hover:text-white transition-colors">About</a>
              <a href="#projects" className="block text-gray-300 hover:text-white transition-colors">Projects</a>
              <a href="#contact" className="block text-gray-300 hover:text-white transition-colors">Contact</a>
            </div>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-xl font-bold mb-4">Connect</h3>
            <div className="flex space-x-4">
              <a 
                href="https://github.com/ougabriel"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <FaGithub className="w-6 h-6" />
              </a>
              <a 
                href="https://linkedin.com/in/gabrielokom"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <FaLinkedin className="w-6 h-6" />
              </a>
              <a 
                href="https://x.com/angelugo_"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-white transition-colors"
                aria-label="X (Twitter)"
              >
                <RiTwitterXFill className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="text-xl font-bold mb-4">Newsletter</h3>
            <p className="text-gray-300 mb-4">Subscribe to my Medium articles for the latest insights and updates.</p>
            <a 
              href="https://medium.com/@ougabriel"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-white text-[#0a0118] px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <SiMedium className="w-5 h-5" />
              <span>Follow on Medium</span>
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-white/10 text-center text-gray-400">
          <p>© {new Date().getFullYear()} Gabriel Okom. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 