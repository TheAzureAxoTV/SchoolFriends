// Auth State Monitor
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // 1. Immediately toggle screens once Firebase authenticates
    if (authSection) authSection.classList.add('hidden');
    if (mainAppSection) mainAppSection.classList.remove('hidden');

    if (userAvatar && user.photoURL) {
      userAvatar.src = user.photoURL;
    }

    // 2. Sync user profile with Worker Database
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL
        })
      });

      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;

        // Unlock Owner Terminal button if role is OWNER
        if (currentUser && currentUser.role === 'OWNER' && ownerConsoleBtn) {
          ownerConsoleBtn.classList.remove('hidden');
        }

        loadMessages();
        setInterval(loadMessages, 3000); // Start chat auto-refresh
      }
    } catch (e) {
      console.error("Database sync failed:", e);
    }
  } else {
    if (authSection) authSection.classList.remove('hidden');
    if (mainAppSection) mainAppSection.classList.add('hidden');
  }
});
    
