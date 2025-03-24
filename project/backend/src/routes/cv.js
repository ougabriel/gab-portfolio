const express = require('express');
const router = express.Router();
const CV = require('../models/CV');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

// Get active CV
router.get('/', async (req, res) => {
  try {
    const cv = await CV.findOne({ isActive: true });
    if (!cv) {
      return res.status(404).json({ message: 'No active CV found' });
    }
    res.json(cv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload new CV (admin only)
router.post('/', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Deactivate current active CV
    await CV.updateMany({}, { isActive: false });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'cv',
      resource_type: 'raw'
    });

    const cv = new CV({
      title: req.body.title || 'My CV',
      description: req.body.description || 'My professional CV',
      file: {
        url: result.secure_url,
        publicId: result.public_id,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });

    await cv.save();
    res.status(201).json(cv);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update CV (admin only)
router.put('/:id', auth, upload.single('cv'), async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) {
      return res.status(404).json({ message: 'CV not found' });
    }

    const updates = {
      title: req.body.title || cv.title,
      description: req.body.description || cv.description
    };

    if (req.file) {
      // Delete old file from Cloudinary
      if (cv.file.publicId) {
        await cloudinary.uploader.destroy(cv.file.publicId, {
          resource_type: 'raw'
        });
      }

      // Upload new file
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'cv',
        resource_type: 'raw'
      });

      updates.file = {
        url: result.secure_url,
        publicId: result.public_id,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      };

      updates.version = cv.version + 1;
    }

    Object.assign(cv, updates);
    await cv.save();

    res.json(cv);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete CV (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) {
      return res.status(404).json({ message: 'CV not found' });
    }

    // Delete file from Cloudinary
    if (cv.file.publicId) {
      await cloudinary.uploader.destroy(cv.file.publicId, {
        resource_type: 'raw'
      });
    }

    await cv.remove();
    res.json({ message: 'CV deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download CV
router.get('/:id/download', async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) {
      return res.status(404).json({ message: 'CV not found' });
    }

    // Increment download count
    cv.downloadCount += 1;
    await cv.save();

    // Redirect to Cloudinary URL
    res.redirect(cv.file.url);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get CV download statistics (admin only)
router.get('/stats/downloads', auth, async (req, res) => {
  try {
    const stats = await CV.aggregate([
      {
        $group: {
          _id: null,
          totalDownloads: { $sum: '$downloadCount' },
          versions: { $sum: 1 }
        }
      }
    ]);

    res.json(stats[0] || { totalDownloads: 0, versions: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 