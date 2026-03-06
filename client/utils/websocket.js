// WebSocket connection management
export function connectWebSocket(onPostReceived, onClearPosts) {
    const ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'post') {
            console.log('Received post from mobile:', data.content);
            onPostReceived(data.content, data.timestamp);
        } else if (data.type === 'clear') {
            console.log('Received clear command');
            onClearPosts();
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(() => connectWebSocket(onPostReceived, onClearPosts), 3000);
    };
    
    return ws;
}
