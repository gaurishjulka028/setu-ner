# SETU-NER — Meta WhatsApp Cloud API setup

## Can this be tested today?
Yes, the Meta developer test number can normally be used for development immediately after adding your own WhatsApp number as a test recipient. Production use with your own business number can require Meta business/phone verification and template review, so that part is not guaranteed to finish today.

## Required server/.env values
```env
WHATSAPP_PROVIDER="meta"
META_WA_TOKEN="<temporary access token>"
META_WA_PHONE_NUMBER_ID="<phone number id>"
META_WA_API_VERSION="v25.0"
META_WA_VERIFY_TOKEN="setu-ner-verify"
META_WA_OTP_TEMPLATE_NAME="<approved authentication template>"
META_WA_OTP_TEMPLATE_LANGUAGE="en_US"
META_WA_UTILITY_TEMPLATE_NAME="<approved utility template with one body variable>"
META_WA_UTILITY_TEMPLATE_LANGUAGE="en_US"
OTP_CHANNEL="whatsapp"
```

## OTP
Create/approve an Authentication template with one body variable for the 6-digit code. The backend sends the code as template parameter 1.

## Disaster alerts / My Drive / dispatch messages
Create/approve a Utility template with one `{{1}}` body variable. The backend sends the complete SETU-NER alert/message as parameter 1.

## Development
Meta's API Setup page provides a test phone number, temporary access token, phone number ID, and a way to add test recipients. Use those for today's demo.

## Production
Replace the temporary token with a system-user access token and complete the business/phone onboarding before deploying. Never commit access tokens to Git.
