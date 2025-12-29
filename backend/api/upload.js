const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// Initialize Supabase client with service role key for admin operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey
  });
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and PDFs
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
      'video/webm',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and PDFs are allowed.'), false);
    }
  }
});

// Upload file to Supabase Storage
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.file;
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(file.originalname).toLowerCase();
    const fileName = `proof_${userId}_${timestamp}_${randomString}${extension}`;
    
    // Upload to Supabase Storage
    // First, ensure the bucket exists or create it
    const bucketName = 'affiliate-proofs';
    
    // Try to get bucket info (this will fail if bucket doesn't exist)
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
    } else {
      const bucketExists = buckets.some(bucket => bucket.name === bucketName);
      
      if (!bucketExists) {
        // Create bucket if it doesn't exist
        const { data: createData, error: createError } = await supabase.storage.createBucket(bucketName, {
          public: true
        });
        
        if (createError) {
          console.error('Error creating bucket:', createError);
          return res.status(500).json({ message: 'Failed to create storage bucket', error: createError.message });
        }
        console.log('Created bucket:', bucketName);
      }
    }
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        metadata: {
          userId: userId.toString(),
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ message: 'Failed to upload file to storage', error: error.message });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('affiliate-proofs')
      .getPublicUrl(fileName);

    // Log the upload for tracking
    console.log(`File uploaded successfully: ${fileName} by user ${userId}`);

    res.json({
      message: 'File uploaded successfully',
      url: publicUrl,
      fileName: fileName,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: 'File upload error: ' + error.message });
    }
    
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Delete uploaded file (optional - for cleanup)
router.delete('/:fileName', auth, async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { fileName } = req.params;
    
    // Verify the file belongs to the user (basic security check)
    if (!fileName.includes(`_${userId}_`)) {
      return res.status(403).json({ message: 'Not authorized to delete this file' });
    }

    const { error } = await supabase.storage
      .from('affiliate-proofs')
      .remove([fileName]);

    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({ message: 'Failed to delete file', error: error.message });
    }

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error during file deletion' });
  }
});

module.exports = router;