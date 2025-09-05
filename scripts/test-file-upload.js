// scripts/test-file-upload.js
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

async function testFileUpload() {
  try {
    // Create a simple test image file
    const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    const formData = new FormData();
    formData.append('file', testImageBuffer, {
      filename: 'test-image.png',
      contentType: 'image/png'
    });
    formData.append('category', 'test');
    formData.append('isPublic', 'false');
    
    console.log('🧪 Testing file upload API...');
    
    // Replace with your actual server URL when running
    const response = await fetch('http://localhost:3000/api/v1/files/upload/single', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_TEST_TOKEN', // Replace with actual token
        'X-Tenant-ID': 'test-tenant', // Replace with actual tenant ID
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Upload test successful!', result);
    } else {
      console.log('❌ Upload test failed:', result);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Uncomment when server is running with authentication
// testFileUpload();

console.log('💡 File upload test script ready');
console.log('💡 Start your server and update the token/URL, then uncomment testFileUpload()');
