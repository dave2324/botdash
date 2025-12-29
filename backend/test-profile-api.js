/**
 * Test script for the profile update API
 * 
 * This script tests the PUT /api/users/profile endpoint
 * 
 * Usage:
 * node test-profile-api.js
 */

require('dotenv').config();
const axios = require('axios');

// You'll need to replace this with a valid Telegram init data for testing
const TEST_INIT_DATA = process.env.TEST_TELEGRAM_INIT_DATA || "query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A5671431%2C%22first_name%22%3A%22Test%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22testuser%22%7D&auth_date=1630000000&hash=abcdef1234567890abcdef1234567890abcdef12";

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testProfileUpdate() {
  console.log('Testing Profile Update API...');
  
  try {
    // First, get current user profile
    console.log('\nGetting current user profile...');
    const getCurrentProfile = await axios.get(`${API_BASE_URL}/api/users/me`, {
      headers: {
        'X-Telegram-Init-Data': TEST_INIT_DATA
      }
    });
    
    console.log('Current profile:', getCurrentProfile.data.user);
    
    // Test data for update
    const updateData = {
      phone_number: '+251987654321',
      email: 'test@example.com'
    };
    
    console.log(`\nUpdating profile with: ${JSON.stringify(updateData)}`);
    
    // Test the profile update API
    const updateResponse = await axios.put(`${API_BASE_URL}/api/users/profile`, updateData, {
      headers: {
        'X-Telegram-Init-Data': TEST_INIT_DATA,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\nAPI Response:');
    console.log(JSON.stringify(updateResponse.data, null, 2));
    
    // Verify the update by getting profile again
    console.log('\nVerifying update with another GET request...');
    const verifyUpdate = await axios.get(`${API_BASE_URL}/api/users/me`, {
      headers: {
        'X-Telegram-Init-Data': TEST_INIT_DATA
      }
    });
    
    console.log('Updated profile:', verifyUpdate.data.user);
    
    // Check if update was successful
    const { phone_number, email } = verifyUpdate.data.user;
    if (phone_number === updateData.phone_number && email === updateData.email) {
      console.log('\n✅ Test PASSED: Profile was updated successfully!');
    } else {
      console.log('\n❌ Test FAILED: Profile update verification mismatch');
      console.log('Expected:', updateData);
      console.log('Actual:', { phone_number, email });
    }
    
  } catch (error) {
    console.error('\n❌ Test FAILED with error:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testProfileUpdate();