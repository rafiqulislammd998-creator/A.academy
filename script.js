// Data Management
let courses = JSON.parse(localStorage.getItem('gymCourses')) || [];
let weightData = JSON.parse(localStorage.getItem('weightData')) || [];
let workoutLog = JSON.parse(localStorage.getItem('workoutLog')) || [];
let currentPDF = null;
let isFirebaseReady = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    renderCourses();
    updateStats();
    renderWeightHistory();
    initWeightChart();
    updateProgress();
    initHeaderScroll();
    initAndroidBackButton();
});

// ==========================================
// FIREBASE INITIALIZATION & SYNC
// ==========================================

function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.log('⚠️ Firebase not loaded, using LocalStorage only');
        showToast('📴 Offline Mode - LocalStorage');
        updateConnectionStatus('offline');
        return;
    }

    try {
        db.collection('courses').limit(1).get()
            .then(() => {
                isFirebaseReady = true;
                updateConnectionStatus('online');
                console.log('✅ Firebase connected');
                loadCoursesFromFirebase();
                setupRealtimeListener();
                showToast('🌐 Firebase Connected!');
            })
            .catch((error) => {
                console.error('❌ Firebase connection failed:', error);
                updateConnectionStatus('offline');
                showToast('📴 Firebase unavailable');
            });
    } catch (error) {
        console.error('❌ Firebase init error:', error);
        updateConnectionStatus('offline');
    }
}

async function loadCoursesFromFirebase() {
    if (!isFirebaseReady) return;

    try {
        updateConnectionStatus('syncing');
        const snapshot = await db.collection('courses')
            .orderBy('createdAt', 'desc')
            .get();

        const firebaseCourses = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            firebaseCourses.push({
                ...data,
                id: data.localId || Date.now(),
                firebaseId: doc.id
            });
        });

        if (firebaseCourses.length > 0) {
            courses = mergeCourses(courses, firebaseCourses);
            localStorage.setItem('gymCourses', JSON.stringify(courses));
            renderCourses();
            updateStats();
            console.log('📥 Loaded', firebaseCourses.length, 'courses from Firebase');
        }

        updateConnectionStatus('online');
    } catch (error) {
        console.error('❌ Load error:', error);
        updateConnectionStatus('offline');
    }
}

function setupRealtimeListener() {
    if (!isFirebaseReady) return;

    db.collection('courses')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    console.log('🆕 New course added:', change.doc.data().name);
                } else if (change.type === 'modified') {
                    console.log('✏️ Course updated:', change.doc.data().name);
                } else if (change.type === 'removed') {
                    console.log('🗑️ Course deleted');
                }
            });

            const firebaseCourses = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                firebaseCourses.push({
                    ...data,
                    id: data.localId || Date.now(),
                    firebaseId: doc.id
                });
            });

            courses = mergeCourses(courses, firebaseCourses);
            localStorage.setItem('gymCourses', JSON.stringify(courses));
            renderCourses();
            updateStats();
        }, (error) => {
            console.error('❌ Real-time listener error:', error);
        });
}

function mergeCourses(local, firebase) {
    const merged = [...local];
    const localIds = new Set(local.map(c => c.videoId));

    firebase.forEach(fbCourse => {
        if (!localIds.has(fbCourse.videoId)) {
            merged.push(fbCourse);
        }
    });

    return merged;
}

async function saveCourseToFirebase(course) {
    if (!isFirebaseReady) {
        console.log('⚠️ Firebase not ready, queued for later');
        return false;
    }

    try {
        updateConnectionStatus('syncing');

        const courseData = {
            localId: course.id,
            name: course.name,
            category: course.category,
            videoId: course.videoId,
            videoUrl: course.videoUrl,
            embedUrl: course.embedUrl,
            description: course.description || '',
            duration: parseInt(course.duration) || 30,
            calories: parseInt(course.calories) || 100,
            completed: course.completed || false,
            hasPDF: course.pdf ? true : false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('courses').add(courseData);
        console.log('✅ Saved to Firebase with ID:', docRef.id);

        course.firebaseId = docRef.id;
        localStorage.setItem('gymCourses', JSON.stringify(courses));

        updateConnectionStatus('online');
        return true;
    } catch (error) {
        console.error('❌ Firebase save error:', error);
        updateConnectionStatus('offline');
        showToast('⚠️ Saved locally, sync failed');
        return false;
    }
}

async function deleteCourseFromFirebase(firebaseId) {
    if (!isFirebaseReady || !firebaseId) return;

    try {
        await db.collection('courses').doc(firebaseId).delete();
        console.log('🗑️ Deleted from Firebase:', firebaseId);
    } catch (error) {
        console.error('❌ Delete error:', error);
    }
}

async function syncLocalToFirebase() {
    if (!isFirebaseReady) return;

    console.log('🔄 Syncing local courses to Firebase...');
    updateConnectionStatus('syncing');

    let synced = 0;
    for (const course of courses) {
        if (!course.firebaseId) {
            const success = await saveCourseToFirebase(course);
            if (success) synced++;
        }
    }

    console.log(`✅ Synced ${synced} courses to Firebase`);
    updateConnectionStatus('online');

    if (synced > 0) {
        showToast(`🔄 ${synced} courses synced!`);
    }
}

// ==========================================
// HEADER & NAVIGATION
// ==========================================

let lastScrollTop = 0;
let scrollThreshold = 100;

function initHeaderScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        if (scrollTop > lastScrollTop && scrollTop > scrollThreshold) {
            navbar.classList.add('hidden');
        } else {
            navbar.classList.remove('hidden');
        }

        lastScrollTop = scrollTop;
    }, { passive: true });
}

function toggleMenu() {
    document.getElementById('navMenu').classList.toggle('active');
}

function closeMenu() {
    document.getElementById('navMenu').classList.remove('active');
}

function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// YOUTUBE HANDLER
// ==========================================

function getYouTubeID(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();

    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[1].length === 11) {
            return match[1];
        }
    }

    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
    } catch (e) {
        console.error('URL parsing error:', e);
    }

    return null;
}

function validateYouTubeUrl(url) {
    const videoId = getYouTubeID(url);
    if (!videoId) {
        return { valid: false, error: '❌ Invalid YouTube URL!' };
    }
    return { valid: true, videoId: videoId };
}

function handlePDFUpload(input) {
    const file = input.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentPDF = {
                name: file.name,
                data: e.target.result
            };
            document.getElementById('pdfPreview').classList.remove('hidden');
            document.getElementById('pdfName').textContent = file.name;
        };
        reader.readAsDataURL(file);
    }
}

function removePDF() {
    currentPDF = null;
    document.getElementById('pdfFile').value = '';
    document.getElementById('pdfPreview').classList.add('hidden');
}

// ==========================================
// COURSE MANAGEMENT
// ==========================================

async function addCourse(e) {
    e.preventDefault();

    const videoUrl = document.getElementById('videoUrl').value.trim();
    const validation = validateYouTubeUrl(videoUrl);

    if (!validation.valid) {
        showToast(validation.error);
        document.getElementById('videoUrl').style.borderColor = '#ff4757';
        setTimeout(() => {
            document.getElementById('videoUrl').style.borderColor = '';
        }, 3000);
        return;
    }

    const exists = courses.some(c => c.videoId === validation.videoId);
    if (exists) {
        showToast('⚠️ This video already exists!');
        return;
    }

    const course = {
        id: Date.now(),
        name: document.getElementById('courseName').value,
        category: document.getElementById('courseCategory').value,
        videoId: validation.videoId,
        videoUrl: videoUrl,
        embedUrl: `https://www.youtube.com/embed/${validation.videoId}`,
        pdf: currentPDF,
        description: document.getElementById('courseDesc').value,
        duration: parseInt(document.getElementById('duration').value) || 30,
        calories: parseInt(document.getElementById('calories').value) || 100,
        date: new Date().toISOString(),
        completed: false
    };

    courses.push(course);
    localStorage.setItem('gymCourses', JSON.stringify(courses));

    await saveCourseToFirebase(course);

    logWorkout(course.duration, course.calories);

    showToast('✅ Course added successfully!');
    document.getElementById('courseForm').reset();
    removePDF();
    renderCourses();
    updateStats();
    updateProgress();
}

function renderCourses(filter = 'all') {
    const grid = document.getElementById('coursesGrid');
    if (!grid) return;

    const filtered = filter === 'all' ? courses : courses.filter(c => c.category === filter);

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="fas fa-dumbbell"></i>
                <h3>No Courses</h3>
                <p>Click "New Courses" button to add a course</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(course => `
        <div class="course-card" data-id="${course.id}">
            <div class="course-thumbnail">
                <img src="https://img.youtube.com/vi/${course.videoId}/mqdefault.jpg" 
                     alt="${course.name}" 
                     onerror="this.src='https://via.placeholder.com/320x180/1a1a2e/ff6b35?text=Video+Not+Found'"
                     loading="lazy">
                <div class="play-icon" onclick="openCourse(${course.id})">
                    <i class="fas fa-play"></i>
                </div>
            </div>
            <div class="course-info">
                <span class="course-category">${getCategoryName(course.category)}</span>
                <h3>${course.name}</h3>
                <p style="color: var(--gray); font-size: 0.9rem; margin-bottom: 0.5rem;">
                    ${course.description || 'No description available'}
                </p>
                <div class="course-meta">
                    <span><i class="fas fa-clock"></i> ${course.duration} min</span>
                    <span><i class="fas fa-fire"></i> ${course.calories} cal</span>
                </div>
                <div class="course-actions">
                    <button class="btn-small btn-watch" onclick="openCourse(${course.id})">
                        <i class="fas fa-play"></i> Watch
                    </button>
                    ${course.pdf ? `
                        <button class="btn-small btn-pdf" onclick="downloadPDF(${course.id})">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                    ` : ''}
                    <button class="btn-small btn-delete" onclick="deleteCourse(${course.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getCategoryName(cat) {
    const names = {
        chest: 'Chest',
        back: 'Back',
        legs: 'Legs',
        shoulder: 'Shoulder',
        abs: 'Abs',
        arms: 'Arms',
        cardio: 'Cardio'
    };
    return names[cat] || cat;
}

function filterCourses(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderCourses(category);
}

async function deleteCourse(id) {
    if (confirm('Are you sure you want to delete this course?')) {
        const course = courses.find(c => c.id === id);

        if (course && course.firebaseId) {
            await deleteCourseFromFirebase(course.firebaseId);
        }

        courses = courses.filter(c => c.id !== id);
        localStorage.setItem('gymCourses', JSON.stringify(courses));

        renderCourses();
        updateStats();
        showToast('🗑️ Course deleted successfully');
    }
}

// ==========================================
// COURSE MODAL
// ==========================================

function openCourse(id) {
    const course = courses.find(c => c.id === id);
    if (!course) return;

    const validation = validateYouTubeUrl(course.videoUrl);
    if (!validation.valid) {
        showToast(validation.error);
        return;
    }

    const modal = document.getElementById('courseModal');
    const body = document.getElementById('modalBody');

    const embedUrl = `https://www.youtube.com/embed/${course.videoId}?` + new URLSearchParams({
        autoplay: '1',
        rel: '0',
        modestbranding: '1',
        enablejsapi: '1',
        origin: window.location.origin,
        widget_referrer: window.location.href
    }).toString();

    body.innerHTML = `
        <h2>${course.name}</h2>
        <span class="course-category">${getCategoryName(course.category)}</span>

        <div class="video-container" style="background: #000; border-radius: 15px; overflow: hidden; position: relative; padding-bottom: 56.25%; height: 0;">
            <iframe 
                src="${embedUrl}" 
                title="${course.name}"
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen
                loading="eager"
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
                onerror="handleVideoError(this)">
            </iframe>
        </div>

        <div id="videoError" style="display: none; padding: 2rem; text-align: center; background: rgba(255,0,0,0.1); border-radius: 10px; margin-top: 1rem;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ff4757; margin-bottom: 1rem;"></i>
            <h3 style="color: #ff4757; margin-bottom: 0.5rem;">Unable to load video!</h3>
            <p>Video may be private or embedding disabled</p>
            <a href="${course.videoUrl}" target="_blank" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #ff4757; color: white; text-decoration: none; border-radius: 25px; font-weight: 600;">
                <i class="fas fa-external-link-alt"></i> Watch directly on YouTube
            </a>
        </div>

        <p style="margin: 1rem 0; color: var(--gray); line-height: 1.8;">
            ${course.description || 'No description available'}
        </p>

        <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 120px; background: var(--dark); padding: 1rem; border-radius: 10px; text-align: center;">
                <i class="fas fa-clock" style="color: var(--primary); font-size: 1.5rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--gray);">Duration</p>
                <h4 style="color: var(--primary);">${course.duration} min</h4>
            </div>
            <div style="flex: 1; min-width: 120px; background: var(--dark); padding: 1rem; border-radius: 10px; text-align: center;">
                <i class="fas fa-fire" style="color: var(--primary); font-size: 1.5rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--gray);">Calories</p>
                <h4 style="color: var(--primary);">${course.calories}</h4>
            </div>
            <div style="flex: 1; min-width: 120px; background: var(--dark); padding: 1rem; border-radius: 10px; text-align: center;">
                <i class="fas fa-calendar" style="color: var(--primary); font-size: 1.5rem;"></i>
                <p style="margin-top: 0.5rem; color: var(--gray);">Date Added</p>
                <h4 style="color: var(--primary); font-size: 0.9rem;">${new Date(course.date).toLocaleDateString()}</h4>
            </div>
        </div>

        ${course.pdf ? `
            <button onclick="downloadPDF(${course.id})" class="btn-submit" style="margin-top: 1.5rem; background: linear-gradient(135deg, #00d9ff 0%, #00a8ff 100%);">
                <i class="fas fa-download"></i> Download PDF
            </button>
        ` : ''}

        <a href="${course.videoUrl}" target="_blank" style="display: block; text-align: center; margin-top: 1rem; color: var(--gray); text-decoration: none;">
            <i class="fab fa-youtube" style="color: #ff0000;"></i> Open on YouTube
        </a>
    `;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    if (!course.completed) {
        course.completed = true;
        course.completedDate = new Date().toISOString();
        localStorage.setItem('gymCourses', JSON.stringify(courses));

        if (course.firebaseId && isFirebaseReady) {
            db.collection('courses').doc(course.firebaseId).update({
                completed: true,
                completedDate: course.completedDate
            });
        }

        updateProgress();
    }
}

function handleVideoError(iframe) {
    const errorDiv = document.getElementById('videoError');
    if (errorDiv) {
        errorDiv.style.display = 'block';
        iframe.style.display = 'none';
    }
}

function closeModal() {
    const modal = document.getElementById('courseModal');
    const body = document.getElementById('modalBody');

    body.innerHTML = '';
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function downloadPDF(courseId) {
    const course = courses.find(c => c.id === courseId);
    if (course && course.pdf) {
        const link = document.createElement('a');
        link.href = course.pdf.data;
        link.download = course.pdf.name;
        link.click();
        showToast('📥 Downloading PDF...');
    }
}

// ==========================================
// STATS & PROGRESS
// ==========================================

function logWorkout(duration, calories) {
    const today = new Date().toDateString();
    const existing = workoutLog.find(w => new Date(w.date).toDateString() === today);

    if (existing) {
        existing.duration += duration;
        existing.calories += calories;
    } else {
        workoutLog.push({
            date: new Date().toISOString(),
            duration: duration,
            calories: calories
        });
    }

    localStorage.setItem('workoutLog', JSON.stringify(workoutLog));
}

function updateStats() {
    const totalVideosEl = document.getElementById('totalVideos');
    const totalPDFsEl = document.getElementById('totalPDFs');
    const totalCaloriesEl = document.getElementById('totalCalories');
    const weeklyWorkoutsEl = document.getElementById('weeklyWorkouts');
    const monthlyCaloriesEl = document.getElementById('monthlyCalories');

    if (totalVideosEl) totalVideosEl.textContent = courses.length;
    if (totalPDFsEl) totalPDFsEl.textContent = courses.filter(c => c.pdf).length;

    const totalCal = workoutLog.reduce((sum, w) => sum + w.calories, 0);
    if (totalCaloriesEl) totalCaloriesEl.textContent = totalCal;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekly = workoutLog.filter(w => new Date(w.date) > weekAgo).length;
    if (weeklyWorkoutsEl) weeklyWorkoutsEl.textContent = weekly;

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthlyCal = workoutLog
        .filter(w => new Date(w.date) > monthAgo)
        .reduce((sum, w) => sum + w.calories, 0);
    if (monthlyCaloriesEl) monthlyCaloriesEl.textContent = monthlyCal;

    calculateStreak();
}

function calculateStreak() {
    const streakEl = document.getElementById('streakDays');
    if (!streakEl) return;

    if (workoutLog.length === 0) {
        streakEl.textContent = 0;
        return;
    }

    const dates = [...new Set(workoutLog.map(w => new Date(w.date).toDateString()))].sort();
    let streak = 0;
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (dates.includes(today) || dates.includes(yesterday.toDateString())) {
        streak = 1;
        for (let i = dates.length - 1; i > 0; i--) {
            const curr = new Date(dates[i]);
            const prev = new Date(dates[i - 1]);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diff === 1) streak++;
            else break;
        }
    }

    streakEl.textContent = streak;
}

function updateProgress() {
    const circle = document.getElementById('dailyProgress');
    if (!circle) return;

    const today = new Date().toDateString();
    const todayWorkout = workoutLog.find(w => new Date(w.date).toDateString() === today);
    const minutes = todayWorkout ? todayWorkout.duration : 0;
    const goal = 60;
    const percentage = Math.min((minutes / goal) * 100, 100);
    const degrees = (percentage / 100) * 360;

    circle.style.background = `conic-gradient(var(--primary) ${degrees}deg, rgba(255,255,255,0.1) ${degrees}deg)`;
    const valueEl = circle.querySelector('.progress-value');
    if (valueEl) valueEl.textContent = `${Math.round(percentage)}%`;
}

// ==========================================
// WEIGHT TRACKER
// ==========================================

function addWeight() {
    const input = document.getElementById('currentWeight');
    const weight = parseFloat(input.value);

    if (!weight || weight <= 0) {
        showToast('❌ Please enter a valid weight!');
        return;
    }

    weightData.push({
        date: new Date().toISOString(),
        weight: weight
    });

    localStorage.setItem('weightData', JSON.stringify(weightData));
    input.value = '';
    renderWeightHistory();
    updateWeightChart();
    showToast('⚖️ Weight added successfully!');
}

function renderWeightHistory() {
    const container = document.getElementById('weightHistory');
    if (!container) return;

    const sorted = [...weightData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    container.innerHTML = sorted.map(w => `
        <div class="weight-item">
            <span>${new Date(w.date).toLocaleDateString()}</span>
            <strong>${w.weight} kg</strong>
        </div>
    `).join('');
}

let weightChart;
function initWeightChart() {
    updateWeightChart();
}

function updateWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;

    ctx.style.height = '250px';
    ctx.style.width = '100%';

    const sorted = [...weightData].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(w => new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const data = sorted.map(w => w.weight);

    if (weightChart) weightChart.destroy();

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: data,
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff6b35',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 10 },
            plugins: {
                legend: {
                    labels: { color: '#fff', font: { size: 12 } }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#b8b8b8', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#b8b8b8', font: { size: 10 }, maxRotation: 45 }
                }
            }
        }
    });
}

// ==========================================
// PASSWORD PROTECTION
// ==========================================

const ADMIN_PASSWORD = 'redwan10';
let isAdmin = false;

function showPasswordPrompt() {
    const modal = document.getElementById('passwordModal');
    const error = document.getElementById('passwordError');
    const input = document.getElementById('adminPassword');

    if (error) error.style.display = 'none';
    if (input) input.value = '';

    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        setTimeout(() => input.focus(), 100);
    }
}

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function checkPassword() {
    const input = document.getElementById('adminPassword');
    const error = document.getElementById('passwordError');

    if (!input) return;

    const enteredPassword = input.value.trim();

    if (enteredPassword === ADMIN_PASSWORD) {
        isAdmin = true;
        closePasswordModal();
        showAdminPanel();
        showToast('✅ Welcome! Admin panel unlocked');
    } else {
        if (error) error.style.display = 'block';
        input.style.borderColor = '#ff4757';
        setTimeout(() => {
            input.style.borderColor = '';
        }, 1000);
    }
}

function showAdminPanel() {
    const addCourseSection = document.getElementById('add-course');
    if (addCourseSection) {
        addCourseSection.style.display = 'block';
        addCourseSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function logoutAdmin() {
    isAdmin = false;
    const addCourseSection = document.getElementById('add-course');
    if (addCourseSection) addCourseSection.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('👋 Logged out');
}

document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkPassword();
        });
    }
});

// ==========================================
// UTILITIES
// ==========================================

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function testYouTubeUrl() {
    const url = document.getElementById('videoUrl').value.trim();
    const validation = validateYouTubeUrl(url);

    if (validation.valid) {
        showToast('✅ Valid video URL! ID: ' + validation.videoId);
        document.getElementById('videoUrl').style.borderColor = '#2ed573';
        setTimeout(() => {
            document.getElementById('videoUrl').style.borderColor = '';
        }, 2000);
    } else {
        showToast(validation.error);
        document.getElementById('videoUrl').style.borderColor = '#ff4757';
    }
}

// ==========================================
// CONNECTION STATUS
// ==========================================

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionStatus');
    if (!indicator) return;

    const icon = indicator.querySelector('i');
    if (!icon) return;

    indicator.className = 'connection-status';

    switch(status) {
        case 'online':
            indicator.classList.add('online');
            icon.className = 'fas fa-wifi';
            indicator.title = 'Real-time connected';
            break;
        case 'offline':
            indicator.classList.add('offline');
            icon.className = 'fas fa-wifi-slash';
            indicator.title = 'Offline mode';
            break;
        case 'syncing':
            indicator.classList.add('syncing');
            icon.className = 'fas fa-sync';
            indicator.title = 'Syncing...';
            break;
    }
}

window.addEventListener('online', () => {
    updateConnectionStatus('online');
    showToast('🌐 Back online - Syncing...');
    syncLocalToFirebase();
});

window.addEventListener('offline', () => {
    updateConnectionStatus('offline');
    showToast('📴 Offline mode - data saved locally');
});

// ==========================================
// ANDROID SPECIFIC
// ==========================================

function initAndroidBackButton() {
    if (window.history && window.history.pushState) {
        window.history.pushState({page: 1}, "", "");

        window.addEventListener('popstate', (e) => {
            const passwordModal = document.getElementById('passwordModal');
            const courseModal = document.getElementById('courseModal');

            if (passwordModal && passwordModal.style.display === 'block') {
                closePasswordModal();
                window.history.pushState({page: 1}, "", "");
            } else if (courseModal && courseModal.style.display === 'block') {
                closeModal();
                window.history.pushState({page: 1}, "", "");
            } else {
                if (confirm('Exit app?')) {
                    // Allow exit
                } else {
                    window.history.pushState({page: 1}, "", "");
                }
            }
        });
    }
}

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

function vibrate(pattern = 50) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button, .btn-primary, .btn-small');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => vibrate(30));
    });
});

// ==========================================
// MODAL CLOSE HANDLERS
// ==========================================

window.onclick = (e) => {
    const passwordModal = document.getElementById('passwordModal');
    const courseModal = document.getElementById('courseModal');

    if (e.target === passwordModal) closePasswordModal();
    if (e.target === courseModal) closeModal();
};