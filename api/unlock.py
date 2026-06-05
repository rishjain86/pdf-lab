from flask import Flask, request, Response
from pypdf import PdfReader, PdfWriter
import io

app = Flask(__name__)

@app.route('/api/unlock', methods=['POST', 'OPTIONS'])
def unlock():
    # Frontend (app.js) ko connect karne ke liye CORS
    if request.method == 'OPTIONS':
        resp = Response(status=200)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        return resp
        
    try:
        # App se aayi hui PDF aur password receive karna
        file = request.files['file']
        password = request.form['password']
        
        # PDF ko read karna
        reader = PdfReader(file)
        
        # Check karna ki file sach mein encrypted hai ya nahi
        if reader.is_encrypted:
            # File ko decrypt (unlock) karne ki koshish karna
            decrypted_status = reader.decrypt(password)
            
            # Agar decrypt_status 0 aata hai matlab password galat hai
            if decrypted_status == 0:
                resp = Response("Incorrect password", status=401)
                resp.headers['Access-Control-Allow-Origin'] = '*'
                return resp
                
        writer = PdfWriter()
        
        # Unlocked PDF ke saare pages naye document mein copy karna
        for page in reader.pages:
            writer.add_page(page)
            
        # Output ko memory mein save karna
        out = io.BytesIO()
        writer.write(out)
        
        # App ko wapas Unlocked (bina password wali) PDF bhej dena
        resp = Response(out.getvalue(), mimetype='application/pdf')
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
        
    except Exception as e:
        # Error handling
        resp = Response(str(e), status=500)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
