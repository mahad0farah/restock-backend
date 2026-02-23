// Quick API test script
const API_URL = 'https://restock-backend-b5nj.onrender.com';

async function testAPI() {
  console.log('Testing Restock Backend API...\n');

  // Test 1: Health check
  console.log('1. Health Check');
  try {
    const healthResponse = await fetch(`${API_URL}/health`);
    const health = await healthResponse.json();
    console.log('✓ Health:', health);
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
  }

  // Test 2: Stock check (Amazon product as example)
  console.log('\n2. Stock Check (Example Product)');
  try {
    const stockResponse = await fetch(`${API_URL}/api/check-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://www.amazon.com/dp/B08N5WRWNW', // Example product
        currentStatus: 'in_stock'
      })
    });
    const stock = await stockResponse.json();
    console.log('✓ Stock check result:', stock);
  } catch (error) {
    console.error('✗ Stock check failed:', error.message);
  }

  console.log('\n✓ All tests completed!');
}

testAPI();
