/*
 Phase 2 Step 2:
 Centralized JWT authentication middleware.
 Does not change token creation.
*/

const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  // Read JWT from Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: { message: "Unauthorized" } 
    });
  }

  try {
    // Verify JWT using existing secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach decoded user to req.user
    req.user = decoded;
    
    next();
  } catch (error) {
    // Do NOT log tokens or leak stack traces
    return res.status(401).json({ 
      success: false, 
      error: { message: "Unauthorized" } 
    });
  }
};

module.exports = authenticate;
