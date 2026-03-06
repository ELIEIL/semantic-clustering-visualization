const pendingPostsContainer = document.getElementById('pendingPosts');
const approvedPostsContainer = document.getElementById('approvedPosts');
const pendingCount = document.getElementById('pendingCount');
const approvedCount = document.getElementById('approvedCount');
const clearAllBtn = document.getElementById('clearAllBtn');

let ws;
const pendingPosts = new Map();
const approvedPosts = new Map();

function connect() {
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('Moderator connected to server');
        ws.send(JSON.stringify({ type: 'register_moderator' }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'init') {
            data.pending.forEach(post => addPendingPost(post));
            data.approved.forEach(post => addApprovedPost(post));
        }
        
        if (data.type === 'new_pending') {
            addPendingPost(data.post);
        }
        
        if (data.type === 'post_approved') {
            removePendingPost(data.postId);
        }
        
        if (data.type === 'post_rejected') {
            removePendingPost(data.postId);
        }
        
        if (data.type === 'all_cleared') {
            clearAll();
        }
    };
    
    ws.onclose = () => {
        console.log('Moderator disconnected from server');
        setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function addPendingPost(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post-item';
    postElement.dataset.id = post.id;
    
    const time = new Date(post.timestamp).toLocaleTimeString();
    
    postElement.innerHTML = `
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-time">${time}</div>
        <div class="post-actions">
            <button class="approve-btn" onclick="approvePost(${post.id})">Approve</button>
            <button class="reject-btn" onclick="rejectPost(${post.id})">Reject</button>
        </div>
    `;
    
    pendingPosts.set(post.id, postElement);
    updatePendingDisplay();
}

function addApprovedPost(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post-item';
    postElement.dataset.id = post.id;
    
    const time = new Date(post.timestamp).toLocaleTimeString();
    
    postElement.innerHTML = `
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-time">${time}</div>
        <div class="post-actions">
            <button class="delete-btn" onclick="deletePost(${post.id})">Delete from Display</button>
        </div>
    `;
    
    approvedPosts.set(post.id, postElement);
    updateApprovedDisplay();
}

function removePendingPost(postId) {
    pendingPosts.delete(postId);
    updatePendingDisplay();
}

function updatePendingDisplay() {
    pendingPostsContainer.innerHTML = '';
    
    if (pendingPosts.size === 0) {
        pendingPostsContainer.innerHTML = '<div class="empty-state">No posts pending review</div>';
    } else {
        pendingPosts.forEach(post => {
            pendingPostsContainer.appendChild(post);
        });
    }
    
    pendingCount.textContent = pendingPosts.size;
}

function updateApprovedDisplay() {
    approvedPostsContainer.innerHTML = '';
    
    if (approvedPosts.size === 0) {
        approvedPostsContainer.innerHTML = '<div class="empty-state">No approved posts</div>';
    } else {
        approvedPosts.forEach(post => {
            approvedPostsContainer.appendChild(post);
        });
    }
    
    approvedCount.textContent = approvedPosts.size;
}

function approvePost(postId) {
    ws.send(JSON.stringify({
        type: 'approve_post',
        postId: postId
    }));
}

function rejectPost(postId) {
    ws.send(JSON.stringify({
        type: 'reject_post',
        postId: postId
    }));
}

function deletePost(postId) {
    if (confirm('Delete this post from the display?')) {
        ws.send(JSON.stringify({
            type: 'delete_post',
            postId: postId
        }));
        approvedPosts.delete(postId);
        updateApprovedDisplay();
    }
}

function clearAll() {
    pendingPosts.clear();
    approvedPosts.clear();
    updatePendingDisplay();
    updateApprovedDisplay();
}

clearAllBtn.addEventListener('click', () => {
    if (confirm('Clear ALL posts (pending and approved)? This cannot be undone.')) {
        ws.send(JSON.stringify({
            type: 'clear_all'
        }));
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

connect();
updatePendingDisplay();
updateApprovedDisplay();
