const bcrypt = require('bcrypt');

// Function to generate a password hash
async function generateHash(password) {
  // Generate a salt
  const salt = await bcrypt.genSalt(10);
  
  // Hash password with salt
  const hash = await bcrypt.hash(password, salt);
  
  console.log('Generated Password Hash:');
  console.log(hash);
  console.log('\nAdd this to your .env file as ADMIN_PASSWORD_HASH');
  
  return hash;
}

// If this file is run directly, generate a hash for the password provided as argument
if (require.main === module) {
  const password = process.argv[2];
  
  if (!password) {
    console.error('Please provide a password as an argument');
    console.error('Usage: node generateHash.js yourpassword');
    process.exit(1);
  }
  
  generateHash(password)
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Error generating hash:', err);
      process.exit(1);
    });
}

module.exports = generateHash; 