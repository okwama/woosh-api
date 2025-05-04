const ImageKit = require('imagekit');
require('dotenv').config();

// Debug environment variables
console.log('Environment variables:');
console.log('IMAGEKIT_PUBLIC_KEY:', process.env.IMAGEKIT_PUBLIC_KEY);
console.log('IMAGEKIT_PRIVATE_KEY:', process.env.IMAGEKIT_PRIVATE_KEY ? 'Set (not shown for security)' : 'Not set');
console.log('IMAGEKIT_URL_ENDPOINT:', process.env.IMAGEKIT_URL_ENDPOINT);

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Test connection by listing files
imagekit.listFiles({
  limit: 5
})
  .then(response => {
    console.log('Success! ImageKit connection works.');
    console.log('Files found:', response.length);
    if (response.length > 0) {
      console.log('Sample file:', {
        name: response[0].name,
        url: response[0].url,
        id: response[0].fileId
      });
    }
  })
  .catch(error => {
    console.error('Error connecting to ImageKit:', error);
  }); 