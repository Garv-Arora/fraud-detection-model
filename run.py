import os
import sys
import subprocess
import shutil

def run_cmd(cmd, cwd=None):
    """Utility to run a command and stream the output."""
    print(f"\n> Running command: {cmd} (Cwd: {cwd or '.'})")
    process = subprocess.Popen(
        cmd,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=cwd
    )
    
    # Stream output to terminal
    for line in process.stdout:
        print(line, end="")
        
    process.wait()
    return process.returncode

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    backend_dir = os.path.join(root_dir, "backend")
    
    print("==================================================================")
    print("      UNIVERSAL SOMPO AI CLAIM EVIDENCE FINDER SYSTEM RUNNER      ")
    print("==================================================================")
    
    # 1. Check/Install Node Modules
    node_modules_path = os.path.join(frontend_dir, "node_modules")
    if not os.path.exists(node_modules_path):
        print("\n[+] Installing frontend dependencies (NPM)...")
        code = run_cmd("npm install", cwd=frontend_dir)
        if code != 0:
            print("\n[-] Error: Failed to install frontend npm packages.")
            sys.exit(1)
    else:
        print("\n[+] Frontend node_modules already exist.")
        
    # 2. Build Frontend
    print("\n[+] Compiling React + Vite frontend production build...")
    code = run_cmd("npm run build", cwd=frontend_dir)
    if code != 0:
        print("\n[-] Error: Frontend compilation failed.")
        sys.exit(1)
        
    dist_dir = os.path.join(frontend_dir, "dist")
    if not os.path.exists(dist_dir) or not os.listdir(dist_dir):
        print("\n[-] Error: Frontend dist/ folder is empty or not created.")
        sys.exit(1)
    
    print("\n[+] Frontend successfully compiled to dist/.")
    print("[+] FastAPI backend will serve static files from dist/.")
    
    # 3. Create .env if not exists
    env_file = os.path.join(root_dir, ".env")
    if not os.path.exists(env_file):
        print("\n[+] Generating default template .env file...")
        with open(env_file, "w") as f:
            f.write("# Universal Sompo Evidence Finder Configuration\n")
            f.write("# Add your Gemini API key below to enable LLM-based parsing & semantic similarity scoring\n")
            f.write("GEMINI_API_KEY=\n")
            f.write("PORT=8000\n")
            f.write("HOST=0.0.0.0\n")
            
    # Read host and port from .env
    host = "0.0.0.0"
    port = "8000"
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                if "=" in line:
                    parts = line.strip().split("=", 1)
                    if len(parts) == 2:
                        key, val = parts[0].strip(), parts[1].strip()
                        if key == "HOST" and val:
                            host = val
                        elif key == "PORT" and val:
                            port = val

    # 4. Start backend FastAPI server
    print("\n[+] Launching FastAPI backend server...")
    print(f"[+] Dashboard will be available at: http://localhost:{port} (local) and http://192.168.1.7:{port} (network)")
    print("[+] Press Ctrl+C to terminate.")
    
    # Run uvicorn backend.main:app
    # Ensure backend directory is in python path
    env = os.environ.copy()
    env["PYTHONPATH"] = root_dir + os.pathsep + env.get("PYTHONPATH", "")
    
    python_exe = sys.executable
    try:
        subprocess.run(f'"{python_exe}" -m uvicorn backend.main:app --host {host} --port {port}', shell=True, cwd=root_dir, env=env)
    except KeyboardInterrupt:
        print("\n[+] Server shut down by user request.")

if __name__ == "__main__":
    main()
