// ================= ==========================================
// ACADEMIX - APP CONTROLLER SCRIPT
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initializers
    initTheme();
    initNavigation();
    initFormHandlers();
    
    // Initial Data Fetch
    loadDashboardData();
    loadStudentsTable();
});

// Global state
let currentStudents = [];
let activeTab = 'dashboard';

// ==========================================================
// THEME MANAGEMENT (LIGHT / DARK)
// ==========================================================
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const darkIcon = themeToggle.querySelector('.dark-icon');
    const lightIcon = themeToggle.querySelector('.light-icon');
    
    // Check saved theme or default to light
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcons(currentTheme, darkIcon, lightIcon);
    
    themeToggle.addEventListener('click', () => {
        const targetTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', targetTheme);
        localStorage.setItem('theme', targetTheme);
        updateThemeIcons(targetTheme, darkIcon, lightIcon);
        
        // Spin animation trigger
        themeToggle.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            themeToggle.style.transform = '';
        }, 300);
    });
}

function updateThemeIcons(theme, darkIcon, lightIcon) {
    if (theme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
    } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
    }
}

// ==========================================================
// VIEWS & NAVIGATION
// ==========================================================
function initNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    
    const pageDetails = {
        'dashboard': { title: 'Dashboard', subtitle: 'Overview of school academic performance' },
        'students': { title: 'Students Directory', subtitle: 'Manage student records and academic standings' },
        'add-student-tab': { title: 'Register Student', subtitle: 'Add a new student profile to the database' }
    };
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            
            // Switch Menu Active Class
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Switch Content Panels
            document.querySelectorAll('.content-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(target).classList.add('active');
            
            // Update Headers
            pageTitle.textContent = pageDetails[target].title;
            pageSubtitle.textContent = pageDetails[target].subtitle;
            
            activeTab = target;
            
            // Reload specific tab data
            if (target === 'dashboard') {
                loadDashboardData();
            } else if (target === 'students') {
                loadStudentsTable();
            }
        });
    });
    
    // Add Student Button redirect from table controls
    document.getElementById('btn-open-add-student').addEventListener('click', () => {
        const addStudentMenuItem = document.querySelector('.menu-item[data-target="add-student-tab"]');
        if (addStudentMenuItem) addStudentMenuItem.click();
    });
}

// ==========================================================
// TOAST ALERTS SYSTEM
// ==========================================================
function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'check';
    if (type === 'error') iconName = 'x-circle';
    if (type === 'info') iconName = 'info';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">
            <i data-lucide="x"></i>
        </button>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Close button event
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });
    
    // Auto-remove after 4.5 seconds
    setTimeout(() => {
        removeToast(toast);
    }, 4500);
}

function removeToast(toast) {
    if (toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// ==========================================================
// API CLIENT IMPLEMENTATION
// ==========================================================

// Dashboard data loader
async function loadDashboardData() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        
        if (stats.error) throw new Error(stats.error);
        
        // Populate text metrics
        document.getElementById('stat-total-students').textContent = stats.total_students;
        document.getElementById('stat-pass-rate').textContent = `${stats.pass_rate}%`;
        document.getElementById('stat-avg-percentage').textContent = `${stats.average_percentage}%`;
        document.getElementById('stat-top-performer').textContent = stats.top_performer;
        document.getElementById('stat-top-performer').title = stats.top_performer;
        
        // Class Distribution Bars
        const distContainer = document.getElementById('class-distribution-list');
        distContainer.innerHTML = '';
        
        if (!stats.class_distribution || stats.class_distribution.length === 0) {
            distContainer.innerHTML = '<div class="empty-state">No student records registered yet.</div>';
        } else {
            // Find max count for ratio width calculations
            const maxCount = Math.max(...stats.class_distribution.map(c => c.count));
            
            stats.class_distribution.forEach(cls => {
                const percentageOfMax = (cls.count / maxCount) * 100;
                const div = document.createElement('div');
                div.className = 'class-dist-item';
                div.innerHTML = `
                    <div class="class-dist-info">
                        <span>${cls.class_name}</span>
                        <span>${cls.count} Student${cls.count > 1 ? 's' : ''}</span>
                    </div>
                    <div class="class-dist-bar-wrapper">
                        <div class="class-dist-bar" style="width: 0%"></div>
                    </div>
                `;
                distContainer.appendChild(div);
                
                // Trigger animated bar slide in
                setTimeout(() => {
                    div.querySelector('.class-dist-bar').style.width = `${percentageOfMax}%`;
                }, 100);
            });
        }
        
        // Subject Performance Loader (based on global averages from student database)
        await calculateSubjectAverages();
        
    } catch (err) {
        console.error('Error fetching dashboard statistics:', err);
        showToast('Error Loading Stats', 'Failed to retrieve academic dashboard statistics.', 'error');
    }
}

// Custom function to calculate subject averages dynamically on frontend from list
async function calculateSubjectAverages() {
    try {
        const res = await fetch('/api/students');
        const students = await res.json();
        
        if (students.length === 0) {
            resetSubjectProgress();
            return;
        }
        
        let sums = { maths: 0, science: 0, english: 0, history: 0, computer_science: 0 };
        students.forEach(s => {
            const marks = s.results;
            sums.maths += marks.maths;
            sums.science += marks.science;
            sums.english += marks.english;
            sums.history += marks.history;
            sums.computer_science += marks.computer_science;
        });
        
        const count = students.length;
        const averages = {
            maths: Math.round(sums.maths / count),
            science: Math.round(sums.science / count),
            english: Math.round(sums.english / count),
            history: Math.round(sums.history / count),
            cs: Math.round(sums.computer_science / count)
        };
        
        // Set metrics
        document.getElementById('avg-maths').textContent = `${averages.maths}%`;
        document.getElementById('progress-maths').style.width = `${averages.maths}%`;
        
        document.getElementById('avg-science').textContent = `${averages.science}%`;
        document.getElementById('progress-science').style.width = `${averages.science}%`;
        
        document.getElementById('avg-english').textContent = `${averages.english}%`;
        document.getElementById('progress-english').style.width = `${averages.english}%`;
        
        document.getElementById('avg-history').textContent = `${averages.history}%`;
        document.getElementById('progress-history').style.width = `${averages.history}%`;
        
        document.getElementById('avg-cs').textContent = `${averages.cs}%`;
        document.getElementById('progress-cs').style.width = `${averages.cs}%`;
        
    } catch (err) {
        console.error('Error calculating subject performance:', err);
    }
}

function resetSubjectProgress() {
    ['maths', 'science', 'english', 'history', 'cs'].forEach(sub => {
        document.getElementById(`avg-${sub}`).textContent = '0%';
        document.getElementById(`progress-${sub}`).style.width = '0%';
    });
}

// Students Directory Table Loader
async function loadStudentsTable() {
    const searchVal = document.getElementById('search-input').value;
    const classFilter = document.getElementById('class-filter').value;
    
    let url = '/api/students';
    const params = [];
    if (searchVal) params.push(`search=${encodeURIComponent(searchVal)}`);
    if (classFilter) params.push(`class_name=${encodeURIComponent(classFilter)}`);
    
    if (params.length > 0) {
        url += `?${params.join('&')}`;
    }
    
    const tableBody = document.getElementById('students-table-body');
    const emptyState = document.getElementById('table-empty-state');
    
    try {
        const res = await fetch(url);
        currentStudents = await res.json();
        
        if (currentStudents.error) throw new Error(currentStudents.error);
        
        tableBody.innerHTML = '';
        
        // Refresh classes filter dropdown dynamic values
        refreshClassFilterOptions(currentStudents);
        
        if (currentStudents.length === 0) {
            emptyState.style.display = 'flex';
            document.getElementById('students-table').style.display = 'none';
            return;
        }
        
        emptyState.style.display = 'none';
        document.getElementById('students-table').style.display = 'table';
        
        currentStudents.forEach(student => {
            const row = document.createElement('tr');
            const marks = student.results;
            const statusClass = marks.status === 'Pass' ? 'pass' : 'fail';
            
            row.innerHTML = `
                <td class="bold">${student.roll_number}</td>
                <td>${student.name}</td>
                <td class="text-muted">${student.email}</td>
                <td><span class="bold">${student.class_name}</span></td>
                <td><span class="badge ${statusClass}">${marks.status}</span></td>
                <td><span class="bold">${marks.percentage}%</span></td>
                <td class="bold">${marks.grade}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-marks" title="Manage Marks" onclick="openMarksModal(${student.id})">
                            <i data-lucide="book-check"></i>
                        </button>
                        <button class="action-btn btn-report" title="View Report Card" onclick="openReportCardModal(${student.id})">
                            <i data-lucide="file-text"></i>
                        </button>
                        <button class="action-btn btn-edit" title="Edit Student Info" onclick="openEditModal(${student.id})">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="action-btn btn-delete" title="Delete Student" onclick="openDeleteModal(${student.id})">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // Re-compile Lucide SVG icons in dynamic rows
        lucide.createIcons();
        
    } catch (err) {
        console.error('Error fetching students list:', err);
        showToast('Load Error', 'Failed to fetch student directory.', 'error');
    }
}

// Generate class options based on what is in database
let detectedClasses = new Set();
function refreshClassFilterOptions(students) {
    const filterSelect = document.getElementById('class-filter');
    const currentValue = filterSelect.value;
    
    // We only recalculate if the students list contains new classes, keeping standard options
    const newClasses = new Set();
    students.forEach(s => newClasses.add(s.class_name));
    
    // Add current seed elements if table is empty
    if (newClasses.size === 0) return;
    
    // Check differences
    let isDifferent = false;
    if (newClasses.size !== detectedClasses.size) {
        isDifferent = true;
    } else {
        for (let item of newClasses) {
            if (!detectedClasses.has(item)) {
                isDifferent = true;
                break;
            }
        }
    }
    
    if (isDifferent) {
        detectedClasses = newClasses;
        
        // Clear except first option
        filterSelect.innerHTML = '<option value="">All Classes</option>';
        
        // Sort and add classes
        Array.from(detectedClasses).sort().forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            if (cls === currentValue) opt.selected = true;
            filterSelect.appendChild(opt);
        });
    }
}

// ==========================================================
// FORM SUBMIT HANDLERS
// ==========================================================
function initFormHandlers() {
    // Add Student Form Submit
    const addForm = document.getElementById('add-student-form');
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            name: document.getElementById('student-name').value,
            roll_number: document.getElementById('student-roll').value,
            email: document.getElementById('student-email').value,
            class_name: document.getElementById('student-class').value
        };
        
        try {
            const res = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Server error occurred');
            
            showToast('Student Registered', `${payload.name} has been enrolled successfully.`, 'success');
            addForm.reset();
            
            // Redirect back to students panel
            const directoryTab = document.querySelector('.menu-item[data-target="students"]');
            if (directoryTab) directoryTab.click();
            
        } catch (err) {
            showToast('Registration Failed', err.message, 'error');
        }
    });

    // Search and Filter dynamic updates
    document.getElementById('search-input').addEventListener('input', debounce(() => {
        loadStudentsTable();
    }, 300));
    
    document.getElementById('class-filter').addEventListener('change', () => {
        loadStudentsTable();
    });

    // Edit Student Form Submit
    const editForm = document.getElementById('edit-student-form');
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('edit-student-id').value;
        const payload = {
            name: document.getElementById('edit-student-name').value,
            roll_number: document.getElementById('edit-student-roll').value,
            email: document.getElementById('edit-student-email').value,
            class_name: document.getElementById('edit-student-class').value
        };
        
        try {
            const res = await fetch(`/api/students/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to update student');
            
            closeModal('edit-student-modal');
            showToast('Record Updated', `Profile details for ${payload.name} saved.`, 'success');
            loadStudentsTable();
            loadDashboardData();
            
        } catch (err) {
            showToast('Update Failed', err.message, 'error');
        }
    });

    // Manage Marks Form Live Calculations & Submit
    const marksForm = document.getElementById('manage-marks-form');
    const marksInputs = ['marks-maths', 'marks-science', 'marks-english', 'marks-history', 'marks-cs'];
    
    marksInputs.forEach(inputId => {
        document.getElementById(inputId).addEventListener('input', calculateLiveMarks);
    });
    
    marksForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('marks-student-id').value;
        const payload = {
            maths: parseInt(document.getElementById('marks-maths').value) || 0,
            science: parseInt(document.getElementById('marks-science').value) || 0,
            english: parseInt(document.getElementById('marks-english').value) || 0,
            history: parseInt(document.getElementById('marks-history').value) || 0,
            computer_science: parseInt(document.getElementById('marks-cs').value) || 0
        };
        
        try {
            const res = await fetch(`/api/students/${id}/marks`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to save marks');
            
            closeModal('manage-marks-modal');
            showToast('Marks Saved', 'Academic performance metrics updated successfully.', 'success');
            loadStudentsTable();
            loadDashboardData();
            
        } catch (err) {
            showToast('Error Saving Marks', err.message, 'error');
        }
    });
    
    // Confirm Delete Click
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    btnConfirmDelete.addEventListener('click', async () => {
        const id = document.getElementById('delete-student-id').value;
        try {
            const res = await fetch(`/api/students/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to delete student');
            
            closeModal('delete-student-modal');
            showToast('Record Deleted', 'Student records removed from the database.', 'info');
            loadStudentsTable();
            loadDashboardData();
            
        } catch (err) {
            showToast('Deletion Failed', err.message, 'error');
        }
    });
}

// Live marks updates calculator inside Modal
function calculateLiveMarks() {
    const maths = parseInt(document.getElementById('marks-maths').value) || 0;
    const science = parseInt(document.getElementById('marks-science').value) || 0;
    const english = parseInt(document.getElementById('marks-english').value) || 0;
    const history = parseInt(document.getElementById('marks-history').value) || 0;
    const cs = parseInt(document.getElementById('marks-cs').value) || 0;
    
    const total = maths + science + english + history + cs;
    const pct = Math.round(total / 5.0);
    
    document.getElementById('marks-live-total').textContent = `${total}/500`;
    document.getElementById('marks-live-percentage').textContent = `${pct}%`;
    
    const statusBadge = document.getElementById('marks-live-status');
    const passed = (maths >= 35 && science >= 35 && english >= 35 && history >= 35 && cs >= 35 && pct >= 40);
    
    statusBadge.className = 'badge';
    if (passed) {
        statusBadge.textContent = 'Pass';
        statusBadge.classList.add('pass');
    } else {
        statusBadge.textContent = 'Fail';
        statusBadge.classList.add('fail');
    }
}

// ==========================================================
// MODAL OPENERS / CLOSERS
// ==========================================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('open');
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('open');
};

// 1. Edit details modal trigger
window.openEditModal = function(id) {
    const student = currentStudents.find(s => s.id === id);
    if (!student) return;
    
    document.getElementById('edit-student-id').value = student.id;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-roll').value = student.roll_number;
    document.getElementById('edit-student-email').value = student.email;
    document.getElementById('edit-student-class').value = student.class_name;
    
    openModal('edit-student-modal');
};

// 2. Marks modal trigger
window.openMarksModal = function(id) {
    const student = currentStudents.find(s => s.id === id);
    if (!student) return;
    
    document.getElementById('marks-student-id').value = student.id;
    document.getElementById('marks-student-subheading').textContent = `Update marks for ${student.name} (Roll: ${student.roll_number})`;
    
    const marks = student.results;
    document.getElementById('marks-maths').value = marks.maths;
    document.getElementById('marks-science').value = marks.science;
    document.getElementById('marks-english').value = marks.english;
    document.getElementById('marks-history').value = marks.history;
    document.getElementById('marks-cs').value = marks.computer_science;
    
    calculateLiveMarks();
    openModal('manage-marks-modal');
};

// 3. Delete modal trigger
window.openDeleteModal = function(id) {
    const student = currentStudents.find(s => s.id === id);
    if (!student) return;
    
    document.getElementById('delete-student-id').value = student.id;
    document.getElementById('delete-student-name-placeholder').textContent = student.name;
    document.getElementById('delete-student-roll-placeholder').textContent = student.roll_number;
    
    openModal('delete-student-modal');
};

// 4. Official printable report card modal trigger
window.openReportCardModal = async function(id) {
    // Open loading state first
    openModal('report-card-modal');
    
    try {
        const res = await fetch(`/api/students/${id}/marks`);
        const report = await res.json();
        
        if (report.error) throw new Error(report.error);
        
        // Student Info Details
        document.getElementById('rc-student-name').textContent = report.name;
        document.getElementById('rc-student-roll').textContent = report.roll_number;
        document.getElementById('rc-student-class').textContent = report.class_name;
        
        // Subject Marks & Grades
        const m = report.marks;
        
        const setSubjectRow = (subjPrefix, score) => {
            document.getElementById(`rc-${subjPrefix}`).textContent = score;
            const subGrade = getSubjectGrade(score);
            document.getElementById(`rc-${subjPrefix}-grade`).textContent = subGrade;
            
            const badge = document.getElementById(`rc-${subjPrefix}-status`);
            badge.className = 'badge';
            if (score >= 35) {
                badge.textContent = 'Pass';
                badge.classList.add('pass');
            } else {
                badge.textContent = 'Fail';
                badge.classList.add('fail');
            }
        };
        
        setSubjectRow('maths', m.maths);
        setSubjectRow('science', m.science);
        setSubjectRow('english', m.english);
        setSubjectRow('history', m.history);
        setSubjectRow('cs', m.computer_science);
        
        // Final Results Summary
        document.getElementById('rc-total').textContent = `${m.total} / 500`;
        document.getElementById('rc-percentage').textContent = `${m.percentage}%`;
        document.getElementById('rc-grade').textContent = m.grade;
        
        const resultStatusVal = document.getElementById('rc-status');
        const statusCard = document.getElementById('rc-status-card');
        
        resultStatusVal.textContent = m.status;
        statusCard.className = 'summary-card result-status-card';
        if (m.status === 'Pass') {
            statusCard.classList.add('pass');
        } else {
            statusCard.classList.add('fail');
        }
        
    } catch (err) {
        console.error('Error fetching report card details:', err);
        showToast('Report Error', 'Could not compile report card metrics.', 'error');
        closeModal('report-card-modal');
    }
};

// Helper grade parser for individual subjects
function getSubjectGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    if (score >= 35) return 'E';
    return 'F';
}

// Debounce helper to optimize search database requests
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
