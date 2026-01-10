/**
 * Simple POC - Master Agent with Mock Tools
 * No MongoDB, no complexity. Just query → decide → execute → respond.
 */
import 'dotenv/config';
import { MasterAgent } from './master-agent.js';

async function main() {
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY not found in .env file');
    console.log('\n📝 Setup:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Edit .env and add your Anthropic API key');
    console.log('  3. Run again');
    process.exit(1);
  }

  // Create Master Agent
  const agent = new MasterAgent(apiKey);

  // Example queries
  const queries = [
    'Add category filtering to the notification system',
    'Find and analyze the authentication code',
    'Run tests for the user profile component'
  ];

  console.log('\n' + '='.repeat(60));
  console.log('🤖 MASTER AGENT POC - TypeScript Version');
  console.log('='.repeat(60));
  console.log('\nNo MongoDB. No complexity. Just Master Agent + Mock Tools.\n');

  console.log('Available queries:');
  queries.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q}`);
  });

  console.log(`\nUsing query 1: ${queries[0]}`);

  // Process the query
  const result = await agent.processQuery(queries[0]);

  // Display final result
  console.log('='.repeat(60));
  console.log('📋 FINAL RESULT');
  console.log('='.repeat(60));
  console.log(`\nQuery: ${result.query}`);
  console.log(`\nSub-Agents Deployed: ${result.agents_used.join(', ')}`);
  console.log(`\n${'='.repeat(60)}`);
  console.log('💡 MASTER SYNTHESIS:');
  console.log('='.repeat(60));
  console.log(result.synthesis);
  console.log(`\n${'='.repeat(60)}\n`);
}

main().catch(console.error);

main().catch(console.error);
