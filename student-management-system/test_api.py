import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:5000"

def request_api(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    req_data = json.dumps(data).encode("utf-8") if data else None
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else None
    except urllib.error.HTTPError as e:
        res_body = e.read().decode("utf-8")
        return e.code, json.loads(res_body) if res_body else None
    except Exception as e:
        print(f"Connection error: {e}")
        sys.exit(1)

def run_tests():
    print("=== STARTING API VERIFICATION TESTS ===")
    
    # 1. Test Stats Endpoint
    status, stats = request_api("/api/stats")
    assert status == 200, "Stats fetch failed"
    print(f"[SUCCESS] Stats Loaded. Total Students: {stats['total_students']}, Pass Rate: {stats['pass_rate']}%")
    initial_total = stats['total_students']
    
    # 2. Test Get Students List
    status, students = request_api("/api/students")
    assert status == 200, "Students fetch failed"
    print(f"[SUCCESS] Student Directory list retrieved. Found {len(students)} records.")
    
    # 3. Create a Student
    new_student = {
        "name": "John Doe",
        "roll_number": "S107",
        "email": "john.doe@school.edu",
        "class_name": "Class C"
    }
    status, created = request_api("/api/students", "POST", new_student)
    assert status == 201, f"Failed to register student: {created}"
    print(f"[SUCCESS] Student Registered: {created['name']} (ID: {created['id']})")
    john_id = created['id']
    
    # 4. Verify Duplicate Roll Number Validation
    status, err_resp = request_api("/api/students", "POST", new_student)
    assert status == 400, "Duplicate roll number check failed"
    print(f"[SUCCESS] Validation triggered on duplicate roll number: {err_resp['error']}")
    
    # 5. Manage Marks
    john_marks = {
        "maths": 85,
        "science": 90,
        "english": 78,
        "history": 82,
        "computer_science": 95
    }
    status, marks_resp = request_api(f"/api/students/{john_id}/marks", "PUT", john_marks)
    assert status == 200, "Failed to save marks"
    m_info = marks_resp['marks']
    print(f"[SUCCESS] Marks updated. Percentage: {m_info['percentage']}%, Status: {m_info['status']}, Grade: {m_info['grade']}")
    assert m_info['status'] == "Pass" and m_info['percentage'] == 86.0, "Marks calculation mismatch!"
    
    # 6. Delete a Student (Bob Johnson: ID 2 or Roll S102)
    # Let's find Bob's ID from directory
    bob_id = None
    for s in students:
        if s['roll_number'] == 'S102':
            bob_id = s['id']
            break
            
    if bob_id:
        status, del_resp = request_api(f"/api/students/{bob_id}", "DELETE")
        assert status == 200, "Failed to delete student"
        print(f"[SUCCESS] Deleted student ID {bob_id} (Bob Johnson)")
    else:
        print("[WARNING] Bob Johnson (S102) not found, skipping delete test")
        
    # 7. Check Updated Stats
    status, final_stats = request_api("/api/stats")
    assert status == 200, "Final stats fetch failed"
    print(f"[SUCCESS] Final Stats Loaded. Total Students: {final_stats['total_students']}, Pass Rate: {final_stats['pass_rate']}%")
    # Total should remain same since we added 1 and deleted 1
    assert final_stats['total_students'] == initial_total, "Total student count mismatch after CRUD"
    
    print("\n=== ALL BACKEND API TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_tests()
