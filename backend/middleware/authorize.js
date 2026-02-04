/*
 Phase 2 Step 2:
 Centralized role-based authorization middleware.
*/

const authorize = (allowedRoles) => {
  return (req, res, next) => {
    // If req.user missing (authenticate middleware not run or failed)
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: { message: "Unauthorized" } 
      });
    }

    // Check if user role is in allowed roles
    // Support both role: "admin" and isAdmin: true formats
    let userRole = req.user.role;
    if (!userRole && req.user.isAdmin === true) {
      userRole = 'admin';
    }
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        error: { message: "Forbidden" } 
      });
    }

    next();
  };
};

module.exports = authorize;

// STEP 2-2 COMPLETE WHEN:
// [ ] authenticate middleware used on all protected routes
// [ ] admin-only routes use authorize([...]) consistently
// [ ] 401 for missing/invalid token
// [ ] 403 for valid token but insufficient role
// [ ] No business logic changed
// [ ] Phase 1 invariants remain intact
// [ ] Reverting commit restores previous behavior
