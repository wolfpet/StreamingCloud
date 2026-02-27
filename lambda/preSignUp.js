exports.handler = async (event) => {
  // Auto-confirm all users
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  
  return event;
};
