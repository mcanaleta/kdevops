from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from pathlib import Path


def util_watch(path: Path, f: callable):
    f(None)

    class Watcher(FileSystemEventHandler):
        def on_any_event(self, event):
            f(event)

    observer = Observer()
    observer.schedule(Watcher(), str(path), recursive=True)
    observer.start()
    observer.join()
