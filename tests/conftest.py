import os
import tempfile
import pytest
from fastapi.testclient import TestClient

@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    # Reload modules so their engine uses the test database.
    import importlib
    import app.database as database
    import app.models as models
    import app.main as main
    import app.worker as worker
    import app.certificates as certificates
    database.DATABASE_URL = f"sqlite:///{db_path}"
    database.engine = database.create_engine(database.DATABASE_URL, connect_args={"check_same_thread": False})
    database.SessionLocal.configure(bind=database.engine)
    models.Base.metadata = models.Base.metadata
    main.engine = database.engine
    main.Base = database.Base
    worker.SessionLocal = database.SessionLocal
    with TestClient(main.app) as test_client:
        yield test_client
    database.Base.metadata.drop_all(bind=database.engine)
    database.engine.dispose()
