<?php

namespace Tests\Unit;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * User Model Test
 * 
 * This test class verifies the functionality of the User model.
 * It tests the model's attributes, relationships, and methods.
 */
class UserTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test that a user can be created with the correct attributes.
     * 
     * @return void
     */
    public function test_user_can_be_created(): void
    {
        // Create a user with the factory
        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => Hash::make('password'),
        ]);

        // Assert that the user was created with the correct attributes
        $this->assertDatabaseHas('users', [
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);

        // Assert that the password was hashed
        $this->assertNotEquals('password', $user->password);
        $this->assertTrue(Hash::check('password', $user->password));
    }

    /**
     * Test that the password is automatically hashed when set.
     * 
     * @return void
     */
    public function test_password_is_hashed_when_set(): void
    {
        // Create a user with a plain text password
        $user = User::create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
        ]);

        // Assert that the password was hashed
        $this->assertNotEquals('password', $user->password);
        $this->assertTrue(Hash::check('password', $user->password));
    }

    /**
     * Test that the hidden attributes are not included in the JSON representation.
     * 
     * @return void
     */
    public function test_hidden_attributes_are_not_included_in_json(): void
    {
        // Create a user
        $user = User::factory()->create();

        // Convert the user to JSON
        $json = $user->toJson();

        // Assert that the hidden attributes are not included
        $this->assertStringNotContainsString('password', $json);
        $this->assertStringNotContainsString('remember_token', $json);
    }

    /**
     * Test that the email_verified_at attribute is cast to a Carbon instance.
     * 
     * @return void
     */
    public function test_email_verified_at_is_cast_to_carbon(): void
    {
        // Create a user with email_verified_at set
        $user = User::factory()->create([
            'email_verified_at' => now(),
        ]);

        // Assert that email_verified_at is a Carbon instance
        $this->assertInstanceOf(\Carbon\Carbon::class, $user->email_verified_at);
    }
} 