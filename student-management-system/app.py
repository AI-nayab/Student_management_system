import os
import sqlite3
import random
import re
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='static', static_url_path='')

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'students.db')

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys for cascade delete
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                roll_number TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                class_name TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS marks (
                student_id INTEGER PRIMARY KEY,
                maths INTEGER DEFAULT 0,
                science INTEGER DEFAULT 0,
                english INTEGER DEFAULT 0,
                history INTEGER DEFAULT 0,
                computer_science INTEGER DEFAULT 0,
                FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
            )
        ''')
        
        # Check if database is empty, then seed initial data
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM students")
        if cursor.fetchone()[0] == 0:
            initial_students = [
                ("Alice Smith", "S101", "alice.smith@school.edu", "Class A"),
                ("Bob Johnson", "S102", "bob.johnson@school.edu", "Class A"),
                ("Charlie Brown", "S103", "charlie.brown@school.edu", "Class B"),
                ("Diana Prince", "S104", "diana.prince@school.edu", "Class B"),
                ("Evan Wright", "S105", "evan.wright@school.edu", "Class C"),
                ("Fiona Gallagher", "S106", "fiona.g@school.edu", "Class C")
            ]
            for name, roll, email, cls in initial_students:
                cursor.execute(
                    "INSERT INTO students (name, roll_number, email, class_name) VALUES (?, ?, ?, ?)",
                    (name, roll, email, cls)
                )
                student_id = cursor.lastrowid
                # Seed realistic marks
                cursor.execute(
                    "INSERT INTO marks (student_id, maths, science, english, history, computer_science) VALUES (?, ?, ?, ?, ?, ?)",
                    (student_id, random.randint(65, 98), random.randint(60, 95), random.randint(70, 95), random.randint(55, 90), random.randint(75, 100))
                )
            conn.commit()

# Helper to calculate report card variables
def calculate_results(row):
    maths = row['maths'] if row['maths'] is not None else 0
    science = row['science'] if row['science'] is not None else 0
    english = row['english'] if row['english'] is not None else 0
    history = row['history'] if row['history'] is not None else 0
    cs = row['computer_science'] if row['computer_science'] is not None else 0
    
    total = maths + science + english + history + cs
    percentage = round(total / 5.0, 1)
    
    # Pass criteria: >=35 in all subjects AND >= 40% overall
    passed = (maths >= 35 and science >= 35 and english >= 35 and 
              history >= 35 and cs >= 35 and percentage >= 40)
    
    if percentage >= 90:
        grade = 'A+'
    elif percentage >= 80:
        grade = 'A'
    elif percentage >= 70:
        grade = 'B'
    elif percentage >= 60:
        grade = 'C'
    elif percentage >= 50:
        grade = 'D'
    elif percentage >= 40:
        grade = 'E'
    else:
        grade = 'F'
        
    return {
        'maths': maths,
        'science': science,
        'english': english,
        'history': history,
        'computer_science': cs,
        'total': total,
        'percentage': percentage,
        'status': 'Pass' if passed else 'Fail',
        'grade': grade
    }

# Email validation helper
def is_valid_email(email):
    pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return re.match(pattern, email) is not None

@app.route('/')
def index():
    return app.send_static_file('index.html')

# API Endpoints

# 1. Dashboard statistics
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Fetch all students and their marks
            cursor.execute('''
                SELECT s.id, s.name, s.class_name, m.maths, m.science, m.english, m.history, m.computer_science
                FROM students s
                LEFT JOIN marks m ON s.id = m.student_id
            ''')
            rows = cursor.fetchall()
            
            total_students = len(rows)
            if total_students == 0:
                return jsonify({
                    'total_students': 0,
                    'pass_rate': 0,
                    'average_marks': 0,
                    'top_performer': 'N/A',
                    'class_distribution': []
                })
                
            passed_count = 0
            total_percentage_sum = 0
            top_percentage = -1
            top_student_name = 'N/A'
            class_counts = {}
            
            for row in rows:
                res = calculate_results(row)
                if res['status'] == 'Pass':
                    passed_count += 1
                total_percentage_sum += res['percentage']
                
                if res['percentage'] > top_percentage:
                    top_percentage = res['percentage']
                    top_student_name = row['name']
                    
                cls = row['class_name']
                class_counts[cls] = class_counts.get(cls, 0) + 1
                
            pass_rate = round((passed_count / total_students) * 100, 1)
            average_percentage = round(total_percentage_sum / total_students, 1)
            
            class_distribution = [{'class_name': k, 'count': v} for k, v in class_counts.items()]
            
            return jsonify({
                'total_students': total_students,
                'pass_rate': pass_rate,
                'average_percentage': average_percentage,
                'top_performer': f"{top_student_name} ({top_percentage}%)" if top_student_name != 'N/A' else 'N/A',
                'class_distribution': class_distribution
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 2. Get students (with optional filters)
@app.route('/api/students', methods=['GET'])
def get_students():
    try:
        search = request.args.get('search', '').strip()
        class_name = request.args.get('class_name', '').strip()
        
        query = '''
            SELECT s.*, m.maths, m.science, m.english, m.history, m.computer_science
            FROM students s
            LEFT JOIN marks m ON s.id = m.student_id
        '''
        params = []
        conditions = []
        
        if search:
            conditions.append("(s.name LIKE ? OR s.roll_number LIKE ?)")
            params.append(f"%{search}%")
            params.append(f"%{search}%")
            
        if class_name:
            conditions.append("s.class_name = ?")
            params.append(class_name)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY s.id DESC"
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            students_list = []
            for row in rows:
                res = calculate_results(row)
                student_dict = {
                    'id': row['id'],
                    'name': row['name'],
                    'roll_number': row['roll_number'],
                    'email': row['email'],
                    'class_name': row['class_name'],
                    'results': res
                }
                students_list.append(student_dict)
                
            return jsonify(students_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 3. Add student
@app.route('/api/students', methods=['POST'])
def add_student():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data'}), 400
            
        name = data.get('name', '').strip()
        roll_number = data.get('roll_number', '').strip()
        email = data.get('email', '').strip()
        class_name = data.get('class_name', '').strip()
        
        if not name or not roll_number or not email or not class_name:
            return jsonify({'error': 'All fields (name, roll_number, email, class_name) are required'}), 400
            
        if not is_valid_email(email):
            return jsonify({'error': 'Invalid email address format'}), 400
            
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Check unique roll number
            cursor.execute("SELECT id FROM students WHERE roll_number = ?", (roll_number,))
            if cursor.fetchone():
                return jsonify({'error': f"Roll number '{roll_number}' is already registered"}), 400
                
            # Insert student
            cursor.execute(
                "INSERT INTO students (name, roll_number, email, class_name) VALUES (?, ?, ?, ?)",
                (name, roll_number, email, class_name)
            )
            student_id = cursor.lastrowid
            
            # Initialize empty marks
            cursor.execute(
                "INSERT INTO marks (student_id, maths, science, english, history, computer_science) VALUES (?, 0, 0, 0, 0, 0)",
                (student_id,)
            )
            conn.commit()
            
            # Fetch created student with marks
            cursor.execute('''
                SELECT s.*, m.maths, m.science, m.english, m.history, m.computer_science
                FROM students s
                LEFT JOIN marks m ON s.id = m.student_id
                WHERE s.id = ?
            ''', (student_id,))
            row = cursor.fetchone()
            
            return jsonify({
                'id': row['id'],
                'name': row['name'],
                'roll_number': row['roll_number'],
                'email': row['email'],
                'class_name': row['class_name'],
                'results': calculate_results(row)
            }), 201
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 4. Update student details
@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data'}), 400
            
        name = data.get('name', '').strip()
        roll_number = data.get('roll_number', '').strip()
        email = data.get('email', '').strip()
        class_name = data.get('class_name', '').strip()
        
        if not name or not roll_number or not email or not class_name:
            return jsonify({'error': 'All fields (name, roll_number, email, class_name) are required'}), 400
            
        if not is_valid_email(email):
            return jsonify({'error': 'Invalid email address format'}), 400
            
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Check student exists
            cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Student not found'}), 404
                
            # Check unique roll number (excluding current student)
            cursor.execute("SELECT id FROM students WHERE roll_number = ? AND id != ?", (roll_number, student_id))
            if cursor.fetchone():
                return jsonify({'error': f"Roll number '{roll_number}' is already taken by another student"}), 400
                
            # Update student
            cursor.execute(
                "UPDATE students SET name = ?, roll_number = ?, email = ?, class_name = ? WHERE id = ?",
                (name, roll_number, email, class_name, student_id)
            )
            conn.commit()
            
            # Fetch updated student with marks
            cursor.execute('''
                SELECT s.*, m.maths, m.science, m.english, m.history, m.computer_science
                FROM students s
                LEFT JOIN marks m ON s.id = m.student_id
                WHERE s.id = ?
            ''', (student_id,))
            row = cursor.fetchone()
            
            return jsonify({
                'id': row['id'],
                'name': row['name'],
                'roll_number': row['roll_number'],
                'email': row['email'],
                'class_name': row['class_name'],
                'results': calculate_results(row)
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 5. Delete student
@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Student not found'}), 404
                
            # Delete student (foreign key cascade deletes marks)
            cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
            conn.commit()
            return jsonify({'message': 'Student deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 6. Get marks for a student
@app.route('/api/students/<int:student_id>/marks', methods=['GET'])
def get_marks(student_id):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT s.name, s.roll_number, s.class_name, m.*
                FROM students s
                LEFT JOIN marks m ON s.id = m.student_id
                WHERE s.id = ?
            ''', (student_id,))
            row = cursor.fetchone()
            
            if not row:
                return jsonify({'error': 'Student not found'}), 404
                
            return jsonify({
                'student_id': student_id,
                'name': row['name'],
                'roll_number': row['roll_number'],
                'class_name': row['class_name'],
                'marks': calculate_results(row)
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 7. Update marks for a student
@app.route('/api/students/<int:student_id>/marks', methods=['PUT'])
def update_marks(student_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data'}), 400
            
        subjects = ['maths', 'science', 'english', 'history', 'computer_science']
        updated_marks = {}
        
        # Validation
        for sub in subjects:
            val = data.get(sub)
            if val is None:
                return jsonify({'error': f"Subject '{sub}' mark is required"}), 400
            try:
                val_int = int(val)
                if val_int < 0 or val_int > 100:
                    raise ValueError
                updated_marks[sub] = val_int
            except (ValueError, TypeError):
                return jsonify({'error': f"Subject '{sub}' mark must be an integer between 0 and 100"}), 400
                
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Check student exists
            cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Student not found'}), 404
                
            # Update marks
            cursor.execute('''
                UPDATE marks
                SET maths = ?, science = ?, english = ?, history = ?, computer_science = ?
                WHERE student_id = ?
            ''', (
                updated_marks['maths'],
                updated_marks['science'],
                updated_marks['english'],
                updated_marks['history'],
                updated_marks['computer_science'],
                student_id
            ))
            conn.commit()
            
            # Fetch updated values for return
            cursor.execute('''
                SELECT s.name, s.roll_number, s.class_name, m.*
                FROM students s
                LEFT JOIN marks m ON s.id = m.student_id
                WHERE s.id = ?
            ''', (student_id,))
            row = cursor.fetchone()
            
            return jsonify({
                'student_id': student_id,
                'name': row['name'],
                'roll_number': row['roll_number'],
                'class_name': row['class_name'],
                'marks': calculate_results(row)
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Initialize database
    init_db()
    # Start flask app on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
