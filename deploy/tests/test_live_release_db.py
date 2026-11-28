"""LG-06/07: actual SHARE barrier on a disposable LOCAL PostgreSQL database.

Uses a labelled local connection substitute, not Google IAM/Cloud SQL evidence.
Refuses non-loopback endpoints and non-test source databases.
"""
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit,unquote
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from live_release_client import GoogleLiveReleaseClient,TABLES

@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Dedicated local PostgreSQL required')
class LocalDatabaseBarrier(unittest.TestCase):
    def setUp(self):
        import pg8000.dbapi
        self.pg=pg8000.dbapi;u=urlsplit(os.environ['TEST_DATABASE_URL'])
        if u.hostname not in ('127.0.0.1','localhost','::1') or not u.path.endswith('_test'):
            raise ValueError('Only a dedicated loopback *_test database is permitted.')
        self.options={'host':u.hostname,'port':u.port or 5432,'user':unquote(u.username or ''),'password':unquote(u.password or '')}
        self.name='lg_'+uuid.uuid4().hex+'_test';self.owner='lgo_'+uuid.uuid4().hex
        self.admin=self.pg.connect(**self.options,database='postgres');self.admin.autocommit=True
        cur=self.admin.cursor();cur.execute('CREATE ROLE '+self.owner+' NOLOGIN');cur.execute('CREATE DATABASE '+self.name+' OWNER '+self.owner)
        with self.local() as cur:
            cur.execute('SET ROLE '+self.owner)
            for table in TABLES:cur.execute('CREATE TABLE public.'+table+' (id integer PRIMARY KEY)')
        self.client=GoogleLiveReleaseClient();self.client.connection=lambda target,kind:self.local()
        self.target={'roles':{'old':{'name':self.owner}}}

    @contextmanager
    def local(self):
        conn=self.pg.connect(**self.options,database=self.name);conn.autocommit=True
        try:yield conn.cursor()
        finally:
            conn.rollback();conn.close()

    def tearDown(self):
        if hasattr(self,'admin'):
            cur=self.admin.cursor();cur.execute('DROP DATABASE '+self.name);cur.execute('DROP ROLE '+self.owner);self.admin.close()

    def test_LG06_share_barrier_blocks_writer_but_permits_reads_and_releases(self):
        with self.client.write_freeze(self.target) as enforced:
            self.assertIs(enforced,True)
            with self.local() as cur:
                cur.execute("SET lock_timeout='150ms'")
                cur.execute('SELECT count(*) FROM public.events');self.assertEqual(cur.fetchone()[0],0)
                with self.assertRaises(self.pg.DatabaseError) as error:cur.execute('INSERT INTO public.events VALUES(1)')
                self.assertEqual(error.exception.args[0]['C'],'55P03')
        with self.local() as cur:
            cur.execute('INSERT INTO public.events VALUES(1)');cur.execute('SELECT count(*) FROM public.events')
            self.assertEqual(cur.fetchone()[0],1)

    def test_LG07_exception_releases_every_table_lock_without_data_changes(self):
        with self.assertRaisesRegex(ValueError,'synthetic-observation-drift'):
            with self.client.write_freeze(self.target):raise ValueError('synthetic-observation-drift')
        with self.local() as cur:
            cur.execute("SET lock_timeout='150ms'")
            for table in TABLES:
                cur.execute('INSERT INTO public.'+table+' VALUES(1)')
                cur.execute('SELECT count(*) FROM public.'+table);self.assertEqual(cur.fetchone()[0],1)

    def test_R9606_same_backend_lock_inspection_detects_transaction_loss(self):
        with self.client.write_freeze(self.target):
            self.client.assert_write_barrier()
            # Only this disposable local transaction is ended, never real sessions.
            self.client.freeze_cursor.execute('ROLLBACK')
            with self.assertRaisesRegex(ValueError,'barrier lost'):
                self.client.assert_write_barrier()

    def test_R9606_partial_barrier_is_not_accepted(self):
        with self.local() as cur:
            cur.execute('BEGIN')
            cur.execute('LOCK TABLE public.events IN SHARE MODE')
            self.client.freeze_cursor=cur
            try:
                with self.assertRaisesRegex(ValueError,'barrier lost'):self.client.assert_write_barrier()
            finally:
                self.client.freeze_cursor=None
                cur.execute('ROLLBACK')

if __name__=='__main__':unittest.main(verbosity=2)
