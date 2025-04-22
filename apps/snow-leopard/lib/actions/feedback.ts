'use server';

import { Resend } from 'resend';

// Initialize Resend client
// Ensure RESEND_API_KEY is set in your environment variables
let resend: Resend | null = null;
try {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Feedback Action] RESEND_API_KEY not found. Feedback emails will not be sent.');
  } else {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch (error) {
  console.error('[Feedback Action] Failed to initialize Resend:', error);
}

interface SendFeedbackParams {
  feedbackContent: string;
  userEmail?: string; // Optional: Include user's email if available
  userId?: string; // Optional: Include user ID
}

/**
 * Server action to send feedback content via email using Resend.
 */
export async function sendFeedbackEmail({ 
  feedbackContent, 
  userEmail, 
  userId 
}: SendFeedbackParams): Promise<{ success: boolean; error?: string }> {
  
  if (!resend) {
    const errorMsg = 'Resend client not initialized. Cannot send feedback email.';
    console.error(`[Feedback Action] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  if (!feedbackContent) {
    return { success: false, error: 'Feedback content cannot be empty.' };
  }

  const recipientEmail = 'williamlovedaypowell@gmail.com';
  const subject = `Feedback Received${userId ? ` (User: ${userId})` : ''}`;
  const body = `
    <h2>New Feedback Received</h2>
    <p><strong>User ID:</strong> ${userId || 'N/A'}</p>
    <p><strong>User Email:</strong> ${userEmail || 'N/A'}</p>
    <hr>
    <p><strong>Feedback:</strong></p>
    <pre>${feedbackContent}</pre>
  `;

  try {
    console.log(`[Feedback Action] Attempting to send feedback email to ${recipientEmail}`);
    const { data, error } = await resend.emails.send({
      from: 'Feedback Bot <onboarding@resend.dev>', // Replace with your verified sender domain
      to: [recipientEmail],
      subject: subject,
      html: body,
    });

    if (error) {
      console.error('[Feedback Action] Resend API Error:', error);
      return { success: false, error: error.message || 'Failed to send email via Resend.' };
    }

    console.log('[Feedback Action] Feedback email sent successfully:', data?.id);
    return { success: true };

  } catch (error: any) {
    console.error('[Feedback Action] Error sending feedback email:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
} 