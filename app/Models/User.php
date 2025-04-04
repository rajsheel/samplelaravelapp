<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * User Model
 * 
 * This model represents a user in the application.
 * It extends the Authenticatable class to provide authentication functionality.
 * 
 * @property int $id The unique identifier for the user
 * @property string $name The user's full name
 * @property string $email The user's email address
 * @property string $password The hashed password
 * @property \Carbon\Carbon|null $email_verified_at The timestamp when the email was verified
 * @property string|null $remember_token The token used for "remember me" functionality
 * @property \Carbon\Carbon $created_at The timestamp when the user was created
 * @property \Carbon\Carbon $updated_at The timestamp when the user was last updated
 */
class User extends Authenticatable
{
    /**
     * Use the HasApiTokens trait to enable API token authentication
     * Use the HasFactory trait to enable model factories for testing
     * Use the Notifiable trait to enable notifications
     */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     * These attributes can be set using the create() or update() methods.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     * These attributes will not be included when the model is converted to an array or JSON.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     * These attributes will be automatically cast to the specified type when accessed.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];
}
