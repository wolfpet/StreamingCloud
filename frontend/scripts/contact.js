// Set the API endpoint on window to avoid duplicate declarations
if (!window.API_ENDPOINT) {
  const config = window.APP_CONFIG || (window.parent && window.parent.APP_CONFIG) || {};
  window.API_ENDPOINT = config.API_URL;
  if (!window.API_ENDPOINT) {
    console.error('APP_CONFIG.API_URL is not defined. Please check config.js');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', handleContactFormSubmit);
  }

  const takedownForm = document.getElementById('takedownForm');
  if (takedownForm) {
    takedownForm.addEventListener('submit', handleTakedownFormSubmit);
  }
});

async function handleContactFormSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const message = document.getElementById('message').value.trim();

  // Validate fields
  if (!name || !email || !message) {
    window.parent.showAlert('Please fill in all required fields', 'warning');
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    window.parent.showAlert('Please enter a valid email address', 'warning');
    return;
  }

  try {
    const response = await fetch(`${window.API_ENDPOINT}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email,
        to: 'admin',
        message: `${name}-----${message}`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send message');
    }

    // Success - clear form and show message
    const contactForm = document.getElementById('contactForm');
    contactForm.reset();
    window.parent.showAlert('Thank you! Your message has been sent successfully.', 'success');
  } catch (error) {
    console.error('Error sending message:', error);
    window.parent.showAlert(`Error sending message: ${error.message}`, 'danger');
  }
}

async function handleTakedownFormSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('takedownEmail').value.trim();
  const fullName = document.getElementById('fullName').value.trim();
  const relationship = document.getElementById('relationship').value.trim();
  const infringingLink = document.getElementById('infringingLink').value.trim();
  const evidenceOfOwnership = document.getElementById('evidenceOfOwnership').value.trim();
  const goodFaith = document.getElementById('goodFaith').checked;

  // Validate fields
  if (!email || !fullName || !relationship || !infringingLink || !evidenceOfOwnership || !goodFaith) {
    window.parent.showAlert('Please fill in all required fields', 'warning');
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    window.parent.showAlert('Please enter a valid email address', 'warning');
    return;
  }

  try {
    const response = await fetch(`${window.API_ENDPOINT}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email,
        to: 'admin',
        message: `${fullName}----${relationship}----${infringingLink}----${evidenceOfOwnership}`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to submit takedown request');
    }

    // Success - clear form and show message
    const takedownForm = document.getElementById('takedownForm');
    takedownForm.reset();
    window.parent.showAlert('Thank you! Your takedown request has been submitted successfully. We will review it and take appropriate action.', 'success');
  } catch (error) {
    console.error('Error submitting takedown request:', error);
    window.parent.showAlert(`Error submitting takedown request: ${error.message}`, 'danger');
  }
}
