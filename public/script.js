// API Configuration
const API_BASE = "";

// Global Variables
let books = {
    read: [],
    unread: [],
    wishlist: []
};
let currentBookType = '';
let editingBookIndex = -1;
let currentUser = null;

// Check authentication on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

// Authentication Functions
async function checkAuthentication() {
    const token = localStorage.getItem('bookshelf_token');
    if (!token) {
        window.location.href = '/auth.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateWelcomeMessage();
            await loadBooks();
        } else {
            localStorage.removeItem('bookshelf_token');
            localStorage.removeItem('bookshelf_user');
            window.location.href = '/auth.html';
        }
    } catch (error) {
        console.error('Authentication check failed:', error);
        window.location.href = '/auth.html';
    }
}

function updateWelcomeMessage() {
    if (currentUser) {
        document.getElementById('welcome-message').textContent = `Welcome, ${currentUser.username}!`;
    }
}

function logout() {
    localStorage.removeItem('bookshelf_token');
    localStorage.removeItem('bookshelf_user');
    window.location.href = '/auth.html';
}

// API Functions
async function makeAuthenticatedRequest(url, options = {}) {
    const token = localStorage.getItem('bookshelf_token');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }

        return response;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

async function loadBooks() {
    showLoading(true);
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/api/books`);
        if (response && response.ok) {
            books = await response.json();
            renderBooks();
        }
    } catch (error) {
        console.error('Failed to load books:', error);
        showMessage('Failed to load books. Please refresh the page.');
    } finally {
        showLoading(false);
    }
}

async function saveBooks() {
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/api/books`, {
            method: 'PUT',
            body: JSON.stringify({ books })
        });

        if (response && !response.ok) {
            throw new Error('Failed to save books');
        }
    } catch (error) {
        console.error('Failed to save books:', error);
        showMessage('Failed to save books. Please try again.');
    }
}

// Book Management Functions
function openAddBook(type) {
    currentBookType = type;
    editingBookIndex = -1;
    
    document.getElementById('modal-title').textContent = 'Add New Book';
    document.getElementById('book-title').value = '';
    document.getElementById('book-author').value = '';
    document.getElementById('book-genre').value = '';
    document.getElementById('book-pages').value = '';
    document.getElementById('current-page').value = '';
    document.getElementById('book-notes').value = '';
    
    const progressGroup = document.getElementById('progress-group');
    if (type === 'unread') {
        progressGroup.style.display = 'block';
    } else {
        progressGroup.style.display = 'none';
    }
    
    document.getElementById('delete-btn').style.display = 'none';
    document.getElementById('recommendations').style.display = 'none';
    
    showModal();
}

function showModal() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('book-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('book-modal').style.display = 'none';
}

function updateProgress() {
    const totalPages = parseInt(document.getElementById('book-pages').value) || 0;
    const currentPage = parseInt(document.getElementById('current-page').value) || 0;
    
    if (totalPages > 0 && currentPage >= 0) {
        const progress = Math.min(Math.round((currentPage / totalPages) * 100), 100);
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = `Progress: ${progress}%`;
    }
}

async function saveBook() {
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();
    const genre = document.getElementById('book-genre').value;
    const pages = parseInt(document.getElementById('book-pages').value) || 0;
    const currentPage = parseInt(document.getElementById('current-page').value) || 0;
    const notes = document.getElementById('book-notes').value.trim();

    if (!title || !author) {
        showMessage('Please enter both title and author!');
        return;
    }

    const book = {
        title,
        author,
        genre,
        pages,
        currentPage,
        notes,
        progress: pages > 0 ? Math.round((currentPage / pages) * 100) : 0,
        color: generateBookColor(),
        dateAdded: new Date().toISOString()
    };

    if (editingBookIndex >= 0) {
        books[currentBookType][editingBookIndex] = book;
    } else {
        books[currentBookType].push(book);
    }

    await saveBooks();
    renderBooks();
    closeModal();
}

function generateBookColor() {
    const colors = [
        'linear-gradient(to right, #2E7D32, #388E3C, #4CAF50)',
        'linear-gradient(to right, #C62828, #D32F2F, #F44336)',
        'linear-gradient(to right, #1565C0, #1976D2, #2196F3)',
        'linear-gradient(to right, #6A1B9A, #8E24AA, #AB47BC)',
        'linear-gradient(to right, #E65100, #FF6F00, #FF8F00)',
        'linear-gradient(to right, #BF360C, #D84315, #FF3D00)',
        'linear-gradient(to right, #1A237E, #303F9F, #3F51B5)'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function renderBooks() {
    const shelves = ['read', 'unread', 'wishlist'];
    
    shelves.forEach(shelf => {
        const container = document.getElementById(shelf + '-books');
        const addButton = container.querySelector('.add-book-btn');
        
        container.innerHTML = '';
        container.appendChild(addButton);
        
        books[shelf].forEach((book, index) => {
            const bookElement = document.createElement('div');
            bookElement.className = `book ${shelf}`;
            
            const shortTitle = book.title.substring(0, 12) + (book.title.length > 12 ? '...' : '');
            const shortAuthor = book.author.substring(0, 10) + (book.author.length > 10 ? '...' : '');
            
            if (book.color) {
                bookElement.style.background = book.color;
            }
            
            bookElement.innerHTML = `
                <div class="book-title">${shortTitle}</div>
                <div class="book-author">${shortAuthor}</div>
            `;
            bookElement.title = `${book.title} by ${book.author}`;
            bookElement.onclick = () => openBookDetails(shelf, index);
            
            container.insertBefore(bookElement, addButton);
        });
    });
}

function openBookDetails(type, index) {
    currentBookType = type;
    editingBookIndex = index;
    const book = books[type][index];
    
    document.getElementById('modal-title').textContent = 'Book Details';
    document.getElementById('book-title').value = book.title;
    document.getElementById('book-author').value = book.author;
    document.getElementById('book-genre').value = book.genre || '';
    document.getElementById('book-pages').value = book.pages || '';
    document.getElementById('current-page').value = book.currentPage || '';
    document.getElementById('book-notes').value = book.notes || '';
    
    const progressGroup = document.getElementById('progress-group');
    if (type === 'unread') {
        progressGroup.style.display = 'block';
        updateProgress();
    } else {
        progressGroup.style.display = 'none';
    }
    
    document.getElementById('delete-btn').style.display = 'inline-block';
    document.getElementById('recommendations').style.display = 'none';
    
    showModal();
}

async function deleteBook() {
    if (confirm('Are you sure you want to delete this book?')) {
        books[currentBookType].splice(editingBookIndex, 1);
        await saveBooks();
        renderBooks();
        closeModal();
    }
}

// AI Features
async function generateAISummary() {
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();

    if (!title || !author) {
        showMessage('Please enter book title and author first');
        return;
    }

    const btn = document.getElementById('ai-summary-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/api/ai-summary`, {
            method: 'POST',
            body: JSON.stringify({ title, author })
        });

        if (response && response.ok) {
            const data = await response.json();
            document.getElementById('book-notes').value = data.summary;
        } else {
            showMessage('Failed to generate summary. Please try again.');
        }
    } catch (error) {
        console.error('AI Summary error:', error);
        showMessage('Failed to generate summary. Please try again.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function exploreGenre(genre) {
    showLoading(true);
    
    try {
        const response = await makeAuthenticatedRequest(`${API_BASE}/api/ai-recommendations`, {
            method: 'POST',
            body: JSON.stringify({ genre })
        });

        if (response && response.ok) {
            const data = await response.json();
            showAIRecommendations(data.recommendations);
        } else {
            showMessage('Failed to get recommendations. Please try again.');
        }
    } catch (error) {
        console.error('AI Recommendations error:', error);
        showMessage('Failed to get recommendations. Please try again.');
    } finally {
        showLoading(false);
    }
}

function showAIRecommendations(recommendations) {
    const modal = document.getElementById('ai-recommendations-modal');
    const content = document.getElementById('ai-recommendations-content');
    
    content.innerHTML = recommendations.map(book => `
        <div class="recommendation-item">
            <h4>${book.title}</h4>
            <div class="author">by ${book.author}</div>
            <div class="overview">${book.overview}</div>
            <button class="add-to-wishlist-btn" onclick="addRecommendationToWishlist('${book.title}', '${book.author}', '${book.genre}', '${book.overview}')">
                Add to Wishlist
            </button>
        </div>
    `).join('');
    
    document.getElementById('overlay').style.display = 'block';
    modal.style.display = 'block';
}

function closeAIRecommendations() {
    document.getElementById('ai-recommendations-modal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

async function addRecommendationToWishlist(title, author, genre, overview) {
    const book = {
        title,
        author,
        genre,
        pages: 0,
        currentPage: 0,
        notes: overview,
        progress: 0,
        color: generateBookColor(),
        dateAdded: new Date().toISOString()
    };

    books.wishlist.push(book);
    await saveBooks();
    renderBooks();
    closeAIRecommendations();
    showMessage('Book added to wishlist!', 'success');
}

// Utility Functions
function showLoading(show = true) {
    const loading = document.getElementById('loading-overlay');
    if (show) {
        loading.classList.add('show');
    } else {
        loading.classList.remove('show');
    }
}

function showMessage(message, type = 'error') {
    // Create a temporary message element
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 2001;
        max-width: 300px;
        background: ${type === 'success' ? '#4CAF50' : '#E53935'};
    `;
    messageEl.textContent = message;
    
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
        messageEl.remove();
    }, 3000);
}

// Event Listeners
document.getElementById('overlay').onclick = () => {
    closeModal();
    closeAIRecommendations();
};

document.getElementById('book-modal').onclick = function(e) {
    e.stopPropagation();
};

document.getElementById('ai-recommendations-modal').onclick = function(e) {
    e.stopPropagation();
};



