const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

// Get all published blog posts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, tag, search } = req.query;
    const query = { status: 'published' };

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const blogs = await Blog.find(query)
      .populate('author', 'username profileImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single blog post
router.get('/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug })
      .populate('author', 'username profileImage')
      .populate('comments.user', 'username profileImage');

    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Increment view count
    blog.views += 1;
    await blog.save();

    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create blog post (admin only)
router.post('/', auth, upload.single('featuredImage'), async (req, res) => {
  try {
    const { title, content, excerpt, tags } = req.body;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let featuredImage = {};
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'blog-images',
        transformation: [{ width: 1200, height: 630, crop: 'fill' }]
      });
      featuredImage = {
        url: result.secure_url,
        publicId: result.public_id
      };
    }

    const blog = new Blog({
      title,
      slug,
      content,
      excerpt,
      tags: tags.split(',').map(tag => tag.trim()),
      featuredImage,
      author: req.user._id
    });

    await blog.save();
    res.status(201).json(blog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update blog post (admin only)
router.put('/:id', auth, upload.single('featuredImage'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    const { title, content, excerpt, tags, status } = req.body;
    const updates = { title, content, excerpt, tags: tags.split(',').map(tag => tag.trim()), status };

    if (req.file) {
      // Delete old image from Cloudinary
      if (blog.featuredImage.publicId) {
        await cloudinary.uploader.destroy(blog.featuredImage.publicId);
      }

      // Upload new image
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'blog-images',
        transformation: [{ width: 1200, height: 630, crop: 'fill' }]
      });
      updates.featuredImage = {
        url: result.secure_url,
        publicId: result.public_id
      };
    }

    Object.assign(blog, updates);
    await blog.save();

    res.json(blog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete blog post (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Delete image from Cloudinary
    if (blog.featuredImage.publicId) {
      await cloudinary.uploader.destroy(blog.featuredImage.publicId);
    }

    await blog.remove();
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add comment to blog post
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    blog.comments.push({
      user: req.user._id,
      content: req.body.content
    });

    await blog.save();
    res.status(201).json(blog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Like blog post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    blog.likes += 1;
    await blog.save();

    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 