import { schedule } from '@netlify/functions';

const handler = schedule("*/30 * * * *", async () => {
  try {
    console.log('[Scheduled Function] Processing Moltbook queue...');
    
    // Get the site URL from environment
    const siteUrl = process.env.URL || 'http://localhost:3000';
    
    const response = await fetch(`${siteUrl}/api/moltbook/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    console.log('[Scheduled Function] Queue processing result:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('[Scheduled Function] Error processing queue:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process queue' }),
    };
  }
});

export { handler };
