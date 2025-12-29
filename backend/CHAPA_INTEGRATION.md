# Chapa Payment Integration Guide

## Overview
This application uses Chapa as the payment gateway for processing deposits. Chapa is an Ethiopian payment gateway that supports multiple payment methods including CBE, telebirr, and other banks.

## Setup Instructions

### 1. Get Chapa API Credentials
1. Sign up for a Chapa account at [https://chapa.co](https://chapa.co)
2. Navigate to your dashboard
3. Get your Secret Key from the API Keys section
4. For testing, use the test secret key (starts with `CHASECK_TEST-`)
5. For production, use the live secret key (starts with `CHASECK-`)

### 2. Configure Environment Variables
Add the following to your backend `.env` file:

```env
# Chapa Configuration
CHAPA_API_KEY=CHASECK_TEST-your-test-key-here
CHAPA_TEST_MODE=true  # Set to false for production
BACKEND_URL=http://localhost:5001  # Your backend URL
FRONTEND_URL=http://localhost:3000  # Your frontend URL
```

### 3. Run Database Migration
Execute the migration to add Chapa-specific columns:

```bash
cd backend
psql -U $DB_USER -h $DB_HOST -d $DB_NAME -f migrate_chapa_integration.sql
```

### 4. Configure Webhook URL in Chapa Dashboard
1. Log in to your Chapa dashboard
2. Go to Settings > Webhooks
3. Add your webhook URL: `https://your-domain.com/api/payments/webhook`
4. Select the events you want to receive:
   - `charge.success` or `charge.completed` - For successful payments
   - `charge.failed` - For failed payments

**Note**: We use a single webhook endpoint that automatically routes payments based on the transaction reference:
- Deposits have references starting with `DEP-`
- Premium subscriptions have references starting with `PREMIUM-`

## API Endpoints

### Deposit Flow

1. **Initiate Deposit** - `POST /api/payments/deposits/initiate`
   - Creates a deposit record
   - Calls Chapa API to create payment
   - Returns payment URL for user

2. **Get Deposit Settings** - `GET /api/payments/deposits/settings`
   - Returns deposit configuration
   - Min/max amounts and conversion rates

3. **Deposit History** - `GET /api/payments/deposits/history`
   - Returns user's deposit history

### Unified Webhook Handler

**Endpoint**: `POST /api/payments/webhook`

This single webhook endpoint handles all Chapa payment notifications:
- Automatically routes based on transaction reference prefix
- Handles both deposits and premium subscriptions
- Updates payment status and user accounts accordingly

## Testing

### Test Card Numbers (for Chapa test mode)
- Success: 4200 0000 0000 0000
- Insufficient funds: 4000 0000 0000 0002
- Invalid card: 4000 0000 0000 0069

### Test Process
1. Set `CHAPA_TEST_MODE=true` in `.env`
2. Use test secret key
3. Make a deposit through the UI
4. Use test card for payment
5. Verify points are added to user account

## Production Checklist

- [ ] Replace test secret key with live secret key
- [ ] Set `CHAPA_TEST_MODE=false`
- [ ] Update webhook URL to production domain
- [ ] Test with small real transaction
- [ ] Monitor logs for any errors
- [ ] Set up error alerting

## Troubleshooting

### Common Issues

1. **Payment URL not generated**
   - Check if CHAPA_API_KEY is set correctly
   - Verify network connectivity to Chapa API
   - Check backend logs for error messages

2. **Webhook not receiving events**
   - Verify webhook URL is publicly accessible
   - Check Chapa dashboard for webhook delivery status
   - Ensure your server accepts POST requests to webhook endpoint

3. **Points not credited after payment**
   - Check deposit status in database
   - Verify webhook processing logs
   - Ensure transaction_logs table is recording changes

## Support

For Chapa-specific issues:
- Documentation: [https://developer.chapa.co](https://developer.chapa.co)
- Support: support@chapa.co

For application issues:
- Check backend logs in `backend/logs/`
- Review database deposit records
- Monitor webhook responses in Chapa dashboard