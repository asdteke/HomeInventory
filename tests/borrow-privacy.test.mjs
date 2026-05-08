import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SECRET_PROVIDER = 'env';
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY_ID = 'borrow-privacy-test-key';

const { redactBorrowRecordForViewer } = await import('../utils/protectedFields.js');

test('redactBorrowRecordForViewer hides sensitive fields from unrelated house viewers', () => {
    const record = {
        id: 1,
        borrower_user_id: 10,
        lent_by_user_id: 20,
        returned_by_user_id: 30,
        borrower_display_name: 'Komsu Ayse',
        borrower_contact: '0555 111 22 33',
        note: 'Kapinin yanina birakildi',
        return_note: 'Hasarsiz geldi'
    };

    const redacted = redactBorrowRecordForViewer(record, {
        viewerUserId: 40,
        itemOwnerUserId: 50
    });

    assert.equal(redacted.borrower_display_name, 'Komsu Ayse');
    assert.equal(redacted.borrower_contact, null);
    assert.equal(redacted.note, null);
    assert.equal(redacted.return_note, null);
});

test('redactBorrowRecordForViewer keeps sensitive fields for the lender and item owner', () => {
    const record = {
        id: 2,
        borrower_user_id: 11,
        lent_by_user_id: 21,
        returned_by_user_id: null,
        borrower_contact: 'borrower@example.com',
        note: 'Hafta sonu iade edecek',
        return_note: null
    };

    const lenderView = redactBorrowRecordForViewer(record, {
        viewerUserId: 21,
        itemOwnerUserId: 99
    });
    const ownerView = redactBorrowRecordForViewer(record, {
        viewerUserId: 99,
        itemOwnerUserId: 99
    });

    assert.equal(lenderView.borrower_contact, 'borrower@example.com');
    assert.equal(lenderView.note, 'Hafta sonu iade edecek');
    assert.equal(ownerView.borrower_contact, 'borrower@example.com');
    assert.equal(ownerView.note, 'Hafta sonu iade edecek');
});
